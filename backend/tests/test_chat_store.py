from src.chat.store import DEFAULT_CHAT_TITLE, ChatNotFoundError, build_chat_title


def test_build_chat_title_empty_returns_fallback():
    assert build_chat_title("") == DEFAULT_CHAT_TITLE
    assert build_chat_title("   \n\t ") == DEFAULT_CHAT_TITLE
    assert build_chat_title("", fallback="custom") == "custom"


def test_build_chat_title_normalizes_whitespace():
    assert build_chat_title("  hello \n  world  ") == "hello world"


def test_build_chat_title_keeps_short_content():
    assert build_chat_title("a" * 60) == "a" * 60


def test_build_chat_title_truncates_long_content():
    title = build_chat_title("a" * 100)
    assert title == "a" * 57 + "..."
    assert len(title) == 60


def test_build_chat_title_truncation_strips_trailing_space():
    content = "a" * 56 + " bcdefg"
    title = build_chat_title(content)
    assert title == "a" * 56 + "..."


def test_chat_not_found_error_carries_chat_id():
    error = ChatNotFoundError(chat_id="abc")
    assert error.chat_id == "abc"
    assert isinstance(error, Exception)
