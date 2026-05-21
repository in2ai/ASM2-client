from langchain_core.messages import HumanMessage, RemoveMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from src.utils.nlp import detect_language
from src.utils.rag import get_rag_system_prompt
from .state import State


def detect_language_node(state: State):
    """Detect the language of the last user message."""
    for msg in reversed(state.messages):
        if isinstance(msg, HumanMessage) and isinstance(msg.content, str):
            try:
                detected = detect_language(msg.content)
            except Exception:
                return {"detected_lang": "es"}
            return {"detected_lang": detected}

    return {"detected_lang": "es"}


def call_model(state: State, config: RunnableConfig):
    configurable = config.get("configurable", {})
    llm_with_tools = configurable.get('llm_with_tools')
    system_prompt = get_rag_system_prompt(state.detected_lang)

    if state.summary:
        system_prompt += f"\n\nSummary of conversation earlier: {state.summary}"

    messages = [SystemMessage(content=system_prompt)] + state.messages
    response = llm_with_tools.invoke(messages, config)
    return {"messages": response}


def summarize_conversation(state: State, config: RunnableConfig):
    summary = state.summary

    if summary:
        summary_message = (
            f"This is summary of the conversation to date: {summary}\n\n"
            "Extend the summary by taking into account the new messages above:"
        )

    else:
        summary_message = "Create a summary of the conversation above:"

    configurable = config.get("configurable", {})
    llm = configurable.get('llm')
    messages = state.messages + [HumanMessage(content=summary_message)]
    response = llm.invoke(messages, config)

    # Keep from the last HumanMessage onward to avoid orphaning tool messages
    human_indices = [i for i, m in enumerate(state.messages) if isinstance(m, HumanMessage)]

    if len(human_indices) < 2:
        # Single-turn conversation: just update summary, don't delete messages
        return {"summary": response.content}

    keep_from = human_indices[-1]
    delete_messages = [RemoveMessage(id=m.id) for m in state.messages[:keep_from]]
    return {"summary": response.content, "messages": delete_messages}
