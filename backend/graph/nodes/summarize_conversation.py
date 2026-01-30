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

    delete_messages = [RemoveMessage(id=m.id) for m in state.messages[:-2]]
    return {"summary": response.content, "messages": delete_messages}
