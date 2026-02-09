from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
from langchain_openai import ChatOpenAI


def rewrite_query_if_needed(query: str, messages: list[AnyMessage]) -> str:
    """Rewrite ambiguous queries using recent conversation context.

    Skips the LLM call entirely if there are fewer than 2 messages
    (no prior conversation to draw context from).
    """
    if len(messages) < 2:
        return query

    # Last 4 messages as context (skip ToolMessage, SystemMessage)
    recent = [m for m in messages[-4:] if isinstance(m, (HumanMessage, AIMessage))]
    history_text = "\n".join(
        f"{'User' if isinstance(m, HumanMessage) else 'Assistant'}: "
        f"{(m.content if m.content else '[Used tools]')[:300]}"
        for m in recent
    )

    rewriter = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    prompt = (
        f"Given this conversation history:\n{history_text}\n\n"
        "Your task: If the following query contains ambiguous pronouns or references "
        '(like "it", "that document", "the same", "more about that"), '
        "rewrite it to be self-contained by incorporating relevant context from the history.\n"
        "If the query is already clear and self-contained, return it unchanged.\n\n"
        f"Original query: {query}\n\n"
        "Respond ONLY with the rewritten query (no explanations, no quotes):"
    )

    try:
        rewritten = rewriter.invoke([HumanMessage(content=prompt)]).content.strip()
        return rewritten if rewritten else query
    except Exception:
        return query
