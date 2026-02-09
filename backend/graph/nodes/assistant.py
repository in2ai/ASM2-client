from langchain_core.messages import SystemMessage
from model import llm_with_tools
from state import State
from src.utils.rag import get_rag_system_prompt


def call_model(state: State):
    system_prompt = get_rag_system_prompt(state.detected_lang)

    if state.summary:
        system_prompt += f"\n\nSummary of conversation earlier: {state.summary}"

    messages = [SystemMessage(content=system_prompt)] + state.messages
    response = llm_with_tools.invoke(messages)
    return {"messages": response}
