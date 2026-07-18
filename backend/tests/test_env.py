from src.config.env import get_bool_env, get_env, get_float_env, get_int_env


def test_get_env_returns_default_when_missing(monkeypatch):
    monkeypatch.delenv("ASM2_TEST_VAR", raising=False)
    assert get_env("ASM2_TEST_VAR") is None
    assert get_env("ASM2_TEST_VAR", "fallback") == "fallback"


def test_get_env_strips_whitespace_and_quotes(monkeypatch):
    monkeypatch.setenv("ASM2_TEST_VAR", '  "value"  ')
    assert get_env("ASM2_TEST_VAR") == "value"


def test_get_env_empty_string_returns_default(monkeypatch):
    monkeypatch.setenv("ASM2_TEST_VAR", '""')
    assert get_env("ASM2_TEST_VAR", "fallback") == "fallback"


def test_get_int_env(monkeypatch):
    monkeypatch.setenv("ASM2_TEST_VAR", "42")
    assert get_int_env("ASM2_TEST_VAR", 0) == 42
    monkeypatch.delenv("ASM2_TEST_VAR")
    assert get_int_env("ASM2_TEST_VAR", 7) == 7


def test_get_float_env(monkeypatch):
    monkeypatch.setenv("ASM2_TEST_VAR", "1.5")
    assert get_float_env("ASM2_TEST_VAR", 0.0) == 1.5


def test_get_bool_env(monkeypatch):
    for truthy in ("1", "true", "True", "YES", "on"):
        monkeypatch.setenv("ASM2_TEST_VAR", truthy)
        assert get_bool_env("ASM2_TEST_VAR") is True

    for falsy in ("0", "false", "off", "no", "anything"):
        monkeypatch.setenv("ASM2_TEST_VAR", falsy)
        assert get_bool_env("ASM2_TEST_VAR") is False

    monkeypatch.delenv("ASM2_TEST_VAR")
    assert get_bool_env("ASM2_TEST_VAR") is False
    assert get_bool_env("ASM2_TEST_VAR", default=True) is True
