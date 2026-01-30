from langchain_core.messages import SystemMessage
from model import llm_with_tools
from state import State


# # Define the logic to call the model
def call_model(state: State):
    summary = state.summary

    if summary:
        system_message = f"Summary of conversation earlier: {summary}"
        messages = [SystemMessage(content=system_message)] + state.messages
    else:
        messages = state.messages

    response = llm_with_tools.invoke(messages)
    return {"messages": response}
