from langchain_core.messages import SystemMessage
from model import llm_with_tools
from state import State


# # Define the logic to call the model
def call_model(state: State):
    # Get summary if it exists
    summary = state.get("summary", "")

    # If there is summary, then we add it
    if summary:
        # Add summary to system message
        system_message = f"Summary of conversation earlier: {summary}"

        # Append summary to any newer messages
        messages = [SystemMessage(content=system_message)] + state["messages"]

    else:
        messages = state["messages"]

    response = llm_with_tools.invoke(messages)
    return {"messages": response}
