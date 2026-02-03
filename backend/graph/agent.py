from checkpointer import checkpointer
from edges.should_continue import should_continue
from langchain_core.messages import SystemMessage
from langgraph.graph import START, StateGraph
from langgraph.prebuilt import ToolNode
from model import llm
from nodes.assistant import call_model as assistant
from nodes.summarize_conversation import summarize_conversation
from state import State

# Here we import our tools/plug-ins for the agent system
from tools.test_tool import test_tool

# 2. Add tools (hybrid search, specific uses)

tool_list = [test_tool]
llm_with_tools = llm.bind_tools(tool_list, parallel_tool_calls=False)

# 3.
# # sys_msg = SystemMessage(
#     content=(
#         "You are a RAG conversational assistant. Respond ONLY with the provided CONTEXT. "
#         "Respond EXCLUSIVELY in the language of the last message of the user, "
#         f"which has been detected to have the following language code: {lang_code}. "
#         "Do not improvise if you don't have information in the context. "
#         'In your response, do not use the word "CONTEXT", instead use "the sources". '
#         "Write in natural, clear, and direct language. "
#         "IMPORTANT: In the 'sources' field, include ONLY the sources you actually used to respond. "
#         "If the question is a greeting, thanks, or does not require information from the sources, leave 'sources' empty. "
#         "Use the conversation history to follow the thread."
#     )
# )
sys_msg = SystemMessage(
    content=("You are a useful AI assistant. Be useful and polite.")
)

# 4. Build graph

builder = StateGraph(State)

builder.add_node("assistant", assistant)
builder.add_node("tools", ToolNode(tool_list))
builder.add_node(summarize_conversation)

builder.add_edge(START, "assistant")
builder.add_conditional_edges("assistant", should_continue)
builder.add_edge("tools", "assistant")

# checkpointer = MemorySaver()
graph = builder.compile(checkpointer=checkpointer)


# Graph is ready to be invoked! graph.invoke
# graph.get_graph().print_ascii()
