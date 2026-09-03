import unittest

from langchain_core.messages import AIMessage

from src.connectors.llms import clamp_reasoning_effort, reasoning_effort_floor
from src.utils.messages import message_text


class ReasoningEffortFloorTests(unittest.TestCase):
    """"none" is a GPT-5.1-and-newer effort; older models reject it outright."""

    def test_gpt_5_1_and_newer_can_stop_reasoning(self):
        self.assertEqual(reasoning_effort_floor("gpt-5.1"), "none")
        self.assertEqual(reasoning_effort_floor("gpt-5.1-mini"), "none")
        self.assertEqual(reasoning_effort_floor("gpt-5.6"), "none")

    def test_the_original_gpt_5_line_stops_at_minimal(self):
        self.assertEqual(reasoning_effort_floor("gpt-5"), "minimal")
        self.assertEqual(reasoning_effort_floor("gpt-5-mini"), "minimal")

    def test_the_o_series_stops_at_low(self):
        for model in ("o1", "o3", "o4-mini"):
            self.assertEqual(reasoning_effort_floor(model), "low")

    def test_the_pro_models_run_at_high_only(self):
        self.assertEqual(reasoning_effort_floor("gpt-5-pro"), "high")
        self.assertEqual(reasoning_effort_floor("gpt-5.1-pro"), "high")


class ClampReasoningEffortTests(unittest.TestCase):
    def test_a_configured_effort_above_the_floor_is_kept(self):
        self.assertEqual(clamp_reasoning_effort("o3", "medium"), "medium")
        self.assertEqual(clamp_reasoning_effort("gpt-5.1", "none"), "none")

    def test_an_effort_the_model_rejects_is_raised_to_its_floor(self):
        self.assertEqual(clamp_reasoning_effort("o3", "none"), "low")
        self.assertEqual(clamp_reasoning_effort("gpt-5", "none"), "minimal")
        self.assertEqual(clamp_reasoning_effort("gpt-5-pro", "medium"), "high")

    def test_the_newer_high_end_efforts_survive_the_clamp(self):
        self.assertEqual(clamp_reasoning_effort("gpt-5.6", "xhigh"), "xhigh")
        self.assertEqual(clamp_reasoning_effort("o3", "max"), "max")

    def test_an_unrecognised_effort_falls_back_to_the_floor(self):
        self.assertEqual(clamp_reasoning_effort("gpt-5.1", "turbo"), "none")


class MessageTextTests(unittest.TestCase):
    """Reasoning routes through the Responses API, which returns content blocks."""

    def test_a_plain_string_is_returned_as_is(self):
        self.assertEqual(message_text(AIMessage(content="hola")), "hola")

    def test_responses_content_blocks_are_joined(self):
        message = AIMessage(
            content=[
                {"type": "reasoning", "summary": []},
                {"type": "text", "text": "hola"},
                {"type": "text", "text": " mundo"},
            ]
        )

        self.assertEqual(message_text(message), "hola mundo")
