from agent import graph
from langgraph.graph import MessagesState

if __name__ == "__main__":
    config = {"configurable": {"thread_id": "1"}}
    query = MessagesState(messages=[("human", "Hello my friend")])  # , perform the test

    response = graph.invoke({"messages": query}, config)

    print(response["messages"][-1].content)
