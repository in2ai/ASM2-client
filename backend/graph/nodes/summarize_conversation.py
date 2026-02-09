from langchain_core.messages import HumanMessage, RemoveMessage
from model import llm
from state import State


def summarize_conversation(state: State):
    summary = state.summary

    if summary:
        summary_message = (
            f"This is summary of the conversation to date: {summary}\n\n"
            "Extend the summary by taking into account the new messages above:"
        )
    else:
        summary_message = "Create a summary of the conversation above:"

    messages = state.messages + [HumanMessage(content=summary_message)]
    response = llm.invoke(messages)

    # Keep from the last HumanMessage onward to avoid orphaning tool messages
    human_indices = [i for i, m in enumerate(state.messages) if isinstance(m, HumanMessage)]
    if len(human_indices) < 2:
        # Single-turn conversation: just update summary, don't delete messages
        return {"summary": response.content}

    keep_from = human_indices[-1]
    delete_messages = [RemoveMessage(id=m.id) for m in state.messages[:keep_from]]
    return {"summary": response.content, "messages": delete_messages}
