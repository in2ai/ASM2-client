from langchain.tools import tool
from langgraph.graph import MessagesState


@tool
def test_tool():
    """Performs a test whenever the user wants to perform a test"""

    return "Test succeeded!"
