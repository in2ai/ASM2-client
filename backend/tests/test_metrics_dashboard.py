import pathlib
import tempfile
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

import server
from src.metrics import dashboard_queries as dq
from src.metrics.token_usage import TokenUsageCounter


def usage(input_tokens, output_tokens):
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
    }


class RecordingPool:
    """Collects the SQL a query builder would run, with its parameters."""

    def __init__(self, rows=None):
        self.rows = rows or []
        self.calls = []

    def __call__(self, pool, query, params=None, max_attempts=3):
        self.calls.append((query, list(params or [])))
        return self.rows

    @property
    def last(self):
        return self.calls[-1]


class TimeZoneTests(unittest.TestCase):
    def test_an_unknown_zone_falls_back_to_utc(self):
        self.assertEqual(dq.normalize_timezone("Not/AZone"), "UTC")
        self.assertEqual(dq.normalize_timezone(""), "UTC")
        self.assertEqual(dq.normalize_timezone(None), "UTC")

    def test_a_known_zone_is_kept(self):
        self.assertEqual(dq.normalize_timezone("Europe/Madrid"), "Europe/Madrid")

    def test_buckets_are_cut_on_the_requested_clock(self):
        params = dq.build_query_params(None, None, None, None, None, "Europe/Madrid")
        recorder = RecordingPool()

        with patch.object(dq, "execute_query_dict", recorder):
            dq.get_activity_by_day(None, params)
            query, query_params = recorder.last

        self.assertIn("to_char(ts AT TIME ZONE %s, 'YYYY-MM-DD')", query)
        self.assertEqual(query_params[0], "Europe/Madrid")

    def test_the_hour_bucket_uses_the_same_clock(self):
        params = dq.build_query_params(None, None, None, None, None, "Europe/Madrid")
        recorder = RecordingPool()

        with patch.object(dq, "execute_query_dict", recorder):
            dq.get_hourly_activity_pattern(None, params)
            query, query_params = recorder.last

        self.assertIn("EXTRACT(HOUR FROM ts AT TIME ZONE %s)", query)
        self.assertEqual(query_params[0], "Europe/Madrid")


class DateRangeTests(unittest.TestCase):
    def test_the_upper_bound_is_exclusive(self):
        params = dq.build_query_params(
            date(2026, 9, 17), date(2026, 9, 21), None, None, None, "UTC"
        )
        conditions, query_params = dq._build_filter_conditions(params)

        self.assertIn("ts >= (%s::timestamp AT TIME ZONE %s)", conditions)
        self.assertIn("ts < (%s::timestamp AT TIME ZONE %s)", conditions)
        # The day after the selected end, so the whole end day is included and
        # the first instant of the next one is not.
        self.assertEqual(query_params, ["2026-09-17", "UTC", "2026-09-22", "UTC"])

    def test_every_placeholder_has_a_parameter(self):
        params = dq.build_query_params(
            date(2026, 9, 17), date(2026, 9, 21), "user-1", "admin", "es", "Europe/Madrid"
        )
        recorder = RecordingPool()

        with patch.object(dq, "execute_query_dict", recorder):
            dq.get_activity_by_day(None, params)
            dq.get_response_time_trend(None, params)
            dq.get_hourly_activity_pattern(None, params)
            dq.count_metrics(None, params, exclude_system_tags=True)
            dq.mean_turn_latency(None, params)
            dq.top_k_search_terms(None, params)

        for query, query_params in recorder.calls:
            self.assertEqual(query.count("%s"), len(query_params), query)


class DayBucketLimitTests(unittest.TestCase):
    def test_a_range_gets_a_row_for_every_day_it_covers(self):
        # The dashboard offers 7, 30 and 90 day presets. A fixed 30-row limit
        # used to cut the widest one down without saying so.
        end = date(2026, 9, 21)

        for days in (7, 30, 90):
            params = dq.build_query_params(
                end - timedelta(days=days - 1), end, None, None, None, None
            )

            self.assertEqual(dq._day_bucket_limit(params), days)

    def test_an_unbounded_range_is_capped(self):
        params = dq.build_query_params(None, None, None, None, None, None)

        self.assertEqual(dq._day_bucket_limit(params), dq.MAX_DAY_BUCKETS)

    def test_a_very_wide_range_is_capped_too(self):
        params = dq.build_query_params(
            date(2015, 1, 1), date(2026, 1, 1), None, None, None, None
        )

        self.assertEqual(dq._day_bucket_limit(params), dq.MAX_DAY_BUCKETS)


class MetricCountTests(unittest.TestCase):
    def test_hardware_telemetry_is_left_out_of_the_assistant_count(self):
        params = dq.build_query_params(None, None, None, None, None, None)
        recorder = RecordingPool([{"cnt": 80}])

        with patch.object(dq, "execute_query_dict", recorder):
            dq.count_metrics(None, params, exclude_system_tags=True)
            query, query_params = recorder.last

        self.assertIn("tag NOT IN", query)
        self.assertEqual(query_params[:3], list(dq.SYSTEM_METRIC_TAGS))


class SystemHealthTests(unittest.TestCase):
    def test_a_resource_that_was_never_sampled_reads_as_none(self):
        params = dq.build_query_params(None, None, None, None, None, None)
        row = {
            "avg_cpu": 3.06,
            "avg_ram": 35.0,
            "avg_gpu": None,
            "max_cpu": 83.9,
            "max_ram": 49.4,
            "max_gpu": None,
        }

        with patch.object(dq, "execute_query_dict", RecordingPool([row])):
            health = dq.get_system_health_stats(None, params)

        # A machine with no GPU must not report a GPU idling at 0%.
        self.assertIsNone(health["avg_gpu"])
        self.assertIsNone(health["max_gpu"])
        self.assertEqual(health["avg_cpu"], 3.06)

    def test_hardware_samples_are_not_filtered_by_user(self):
        params = dq.build_query_params(None, None, "user-1", "admin", None, None)
        recorder = RecordingPool([{}])

        with patch.object(dq, "execute_query_dict", recorder):
            dq.get_system_health_stats(None, params)
            query, _ = recorder.last

        # These rows carry no user, so a user filter would always empty them.
        self.assertNotIn("user_id = %s", query)


class TurnLatencyTests(unittest.TestCase):
    def test_the_previous_tag_name_is_still_read(self):
        params = dq.build_query_params(None, None, None, None, None, None)
        recorder = RecordingPool([{"avg": 37.5}])

        with patch.object(dq, "execute_query_dict", recorder):
            dq.mean_turn_latency(None, params)
            _, query_params = recorder.last

        self.assertIn("LLM_RESPONSE_TIME", query_params)
        self.assertIn("TURN_RESPONSE_TIME", query_params)


class LatestTurnTests(unittest.TestCase):
    def test_only_the_messages_after_the_last_question_count(self):
        messages = [
            HumanMessage(content="first"),
            AIMessage(content="first answer"),
            HumanMessage(content="second"),
            AIMessage(content="second answer"),
        ]

        turn = server.messages_in_latest_turn(messages)

        self.assertEqual([m.content for m in turn], ["second answer"])

    def test_a_thread_with_no_question_yields_nothing(self):
        self.assertEqual(server.messages_in_latest_turn([]), [])
        self.assertEqual(
            server.messages_in_latest_turn([AIMessage(content="orphan")]), []
        )


class TokenUsageRecordingTests(unittest.TestCase):
    def build_thread(self):
        """Two turns, as graph state would hold them after the second."""
        return [
            HumanMessage(content="first"),
            AIMessage(content="", usage_metadata=usage(1000, 100)),
            HumanMessage(content="second"),
            AIMessage(content="", usage_metadata=usage(2000, 200)),
        ]

    def test_earlier_turns_are_not_recorded_again(self):
        recorded = []

        with patch.object(
            server,
            "insert_metric",
            lambda pool, tag, value, actor: recorded.append((tag, value)),
        ):
            server.record_token_usage_metrics(None, self.build_thread(), object())

        # Only the second turn: 1000/100 belong to a turn already recorded.
        self.assertEqual(
            recorded,
            [("NUM_LLM_TOKENS_IN", 2000), ("NUM_LLM_TOKENS_OUT", 200)],
        )

    def test_a_turn_with_several_model_calls_is_summed_into_one_row(self):
        messages = [
            HumanMessage(content="q"),
            AIMessage(content="", usage_metadata=usage(500, 20)),
            ToolMessage(content="result", tool_call_id="call-1"),
            AIMessage(content="answer", usage_metadata=usage(900, 80)),
        ]
        recorded = []

        with patch.object(
            server,
            "insert_metric",
            lambda pool, tag, value, actor: recorded.append((tag, value)),
        ):
            server.record_token_usage_metrics(None, messages, object())

        self.assertEqual(
            recorded,
            [("NUM_LLM_TOKENS_IN", 1400), ("NUM_LLM_TOKENS_OUT", 100)],
        )

    def test_a_turn_that_spent_nothing_writes_no_row(self):
        recorded = []

        with patch.object(
            server,
            "insert_metric",
            lambda pool, tag, value, actor: recorded.append((tag, value)),
        ):
            server.record_token_usage_metrics(
                None, [HumanMessage(content="q"), AIMessage(content="a")], object()
            )

        self.assertEqual(recorded, [])


class TokenUsageCounterTests(unittest.TestCase):
    def test_it_totals_usage_across_calls(self):
        from langchain_core.outputs import ChatGeneration, LLMResult

        counter = TokenUsageCounter()

        for _ in range(3):
            counter.on_llm_end(
                LLMResult(
                    generations=[
                        [
                            ChatGeneration(
                                message=AIMessage(
                                    content="x", usage_metadata=usage(120, 7)
                                )
                            )
                        ]
                    ]
                )
            )

        self.assertEqual(counter.totals, (360, 21))

    def test_a_response_without_usage_is_ignored(self):
        from langchain_core.outputs import ChatGeneration, LLMResult

        counter = TokenUsageCounter()
        counter.on_llm_end(
            LLMResult(generations=[[ChatGeneration(message=AIMessage(content="x"))]])
        )

        self.assertEqual(counter.totals, (0, 0))


class RagTokenRecordingTests(unittest.TestCase):
    def test_the_retrieval_path_spend_is_stored_under_the_rag_tags(self):
        from graph import tools

        counter = TokenUsageCounter()
        counter.input_tokens = 4200
        counter.output_tokens = 310
        recorded = []

        with patch.object(
            tools,
            "insert_metric",
            lambda pool, tag, value, actor: recorded.append((tag, value)),
        ):
            tools.record_rag_token_usage(object(), counter, object())

        self.assertEqual(
            recorded,
            [("NUM_RAG_TOKENS_IN", 4200), ("NUM_RAG_TOKENS_OUT", 310)],
        )

    def test_nothing_is_stored_when_no_model_was_called(self):
        from graph import tools

        recorded = []

        with patch.object(
            tools,
            "insert_metric",
            lambda pool, tag, value, actor: recorded.append((tag, value)),
        ):
            tools.record_rag_token_usage(object(), TokenUsageCounter(), object())

        self.assertEqual(recorded, [])


class FakeNvidiaGpu:
    def __init__(self, load):
        # GPUtil reports a 0-1 fraction, not a percentage.
        self.load = load


class GpuUsageTests(unittest.TestCase):
    def amd_sysfs(self, contents):
        """A stand-in for the amdgpu driver's sysfs node."""
        tmp = tempfile.TemporaryDirectory()
        device = pathlib.Path(tmp.name) / "card0" / "device"
        device.mkdir(parents=True)

        if contents is not None:
            (device / "gpu_busy_percent").write_text(contents)

        self.addCleanup(tmp.cleanup)

        return f"{tmp.name}/card*/device/gpu_busy_percent"

    def test_an_nvidia_card_is_read_as_a_percentage(self):
        with patch("GPUtil.getGPUs", return_value=[FakeNvidiaGpu(0.37)]):
            self.assertAlmostEqual(server.read_nvidia_gpu_usage(), 37.0)

    def test_no_nvidia_card_is_not_an_error(self):
        with patch("GPUtil.getGPUs", return_value=[]):
            self.assertIsNone(server.read_nvidia_gpu_usage())

    def test_a_failing_nvidia_probe_does_not_escape(self):
        with patch("GPUtil.getGPUs", side_effect=OSError("nvidia-smi missing")):
            self.assertIsNone(server.read_nvidia_gpu_usage())

    def test_an_amd_card_is_read_from_sysfs(self):
        # GPUtil only knows nvidia-smi, so this is the whole AMD story.
        with patch.object(server, "AMD_GPU_BUSY_PATHS", self.amd_sysfs("42\n")):
            self.assertEqual(server.read_amd_gpu_usage(), 42.0)

    def test_a_machine_with_no_amd_card_reads_as_none(self):
        with patch.object(server, "AMD_GPU_BUSY_PATHS", self.amd_sysfs(None)):
            self.assertIsNone(server.read_amd_gpu_usage())

    def test_unreadable_contents_are_not_an_error(self):
        with patch.object(server, "AMD_GPU_BUSY_PATHS", self.amd_sysfs("n/a")):
            self.assertIsNone(server.read_amd_gpu_usage())

    def test_an_amd_card_is_found_when_there_is_no_nvidia_one(self):
        with (
            patch("GPUtil.getGPUs", return_value=[]),
            patch.object(server, "AMD_GPU_BUSY_PATHS", self.amd_sysfs("9\n")),
        ):
            self.assertEqual(server.read_gpu_usage(), 9.0)

    def test_an_nvidia_card_wins_when_both_answer(self):
        with (
            patch("GPUtil.getGPUs", return_value=[FakeNvidiaGpu(0.5)]),
            patch.object(server, "AMD_GPU_BUSY_PATHS", self.amd_sysfs("9\n")),
        ):
            self.assertEqual(server.read_gpu_usage(), 50.0)

    def test_a_machine_with_no_gpu_at_all_reads_as_none(self):
        with (
            patch("GPUtil.getGPUs", return_value=[]),
            patch.object(server, "AMD_GPU_BUSY_PATHS", self.amd_sysfs(None)),
        ):
            # None, so the dashboard says "not sampled" instead of 0%.
            self.assertIsNone(server.read_gpu_usage())


if __name__ == "__main__":
    unittest.main()
