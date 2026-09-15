from langchain_core.messages import BaseMessage


def message_text(message: BaseMessage) -> str:
    """Plain text of a message.

    The Responses API returns content as a list of blocks instead of a string,
    so text has to be joined back together for storage and for the API replies.
    """
    content = message.content

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        return "".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and part.get("type") == "text"
        )

    return str(content)
