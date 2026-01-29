from agent import graph

# from langgraph.graph import MessagesState
from state import State

if __name__ == "__main__":
    config = {"configurable": {"thread_id": "1"}}
    query = State({"role": "human", "content": "Hello my friend"})  # , perform the test

    response = graph.invoke({"messages": query}, config)

    print(response["messages"][-1].content)
