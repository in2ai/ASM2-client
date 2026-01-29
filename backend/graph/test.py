from agent import graph
from langgraph.graph import MessagesState

if __name__ == "__main__":
    query = MessagesState(messages=[("human", "Hello my friend")])
    response = graph.invoke(query)
    print(response["messages"][-1].content)
