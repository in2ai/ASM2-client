import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent import graph
from langchain_core.messages import HumanMessage

config = {"configurable": {"thread_id": "1"}}

if __name__ == "__main__":
    # Save graph visualization to file
    png_bytes = graph.get_graph().draw_mermaid_png()
    graph_path = Path(__file__).parent / "graph_diagram.png"
    graph_path.write_bytes(png_bytes)
    print(f"Graph diagram saved to {graph_path}\n")

    print("Graph pipeline test\n")

    # 1. Basic conversation
    print("User: Hello, how are you?")
    response = graph.invoke(
        {
            "messages": [HumanMessage(content="Hello, how are you?")],
            "user_id": "test_user",
            "detected_lang": "en",
            "summary": "",
        },
        config,
    )
    print(f"Assistant: {response['messages'][-1].content}\n")

    # 2. Tool invocation — ask the LLM to run the test tool
    print("User: Please perform the test")
    response = graph.invoke(
        {
            "messages": [HumanMessage(content="Please perform the test")],
            "user_id": "test_user",
            "detected_lang": "en",
            "summary": "",
        },
        config,
    )
    print(f"Assistant (after tool): {response['messages'][-1].content}\n")

    # 3. Memory — same thread should remember prior messages
    print("User: What did I ask you first?")
    response = graph.invoke(
        {
            "messages": [HumanMessage(content="What did I ask you first?")],
            "user_id": "test_user",
            "detected_lang": "en",
            "summary": "",
        },
        config,
    )
    print(f"Assistant (memory check): {response['messages'][-1].content}\n")

    print(f"Total messages in thread: {len(response['messages'])}")

    # 4. Long-term memory — trigger summarization by exceeding 6 messages
    print("=" * 40)
    print("Long-term memory (summarization) test\n")

    ltm_config = {"configurable": {"thread_id": "2"}}
    topics = [
        "Tell me about black holes",
        "Now tell me about quantum computing",
        "What is the Fibonacci sequence?",
        "Explain photosynthesis briefly",
    ]

    for i, topic in enumerate(topics, 1):
        print(f'  User: "{topic}"')
        response = graph.invoke(
            {
                "messages": [HumanMessage(content=topic)],
                "user_id": "test_user",
                "detected_lang": "en",
                "summary": "",
            },
            ltm_config,
        )
        msg_count = len(response["messages"])
        print(f"  Turn {i}: -> {msg_count} messages in state")

    # Check summarization state via checkpointer
    state_snapshot = graph.get_state(ltm_config)
    summary = state_snapshot.values.get("summary", "")
    final_msg_count = len(state_snapshot.values.get("messages", []))

    print(f"\n  Summary populated: {bool(summary)}")
    print(
        f"  Summary preview:   {summary[:120]}..."
        if len(summary) > 120
        else f"  Summary: {summary}"
    )
    print(f"  Messages after trim: {final_msg_count}")

    if summary:
        print("  [OK] Summarization triggered successfully")
    else:
        print(
            "  [FAIL] WARNING: Summary is empty -- summarization may not have triggered"
        )

    # Verify the assistant can recall earlier topics via the summary
    print('  User: "What topics have we discussed so far?"')
    response = graph.invoke(
        {
            "messages": [HumanMessage(content="What topics have we discussed so far?")],
            "user_id": "test_user",
            "detected_lang": "en",
            "summary": "",
        },
        ltm_config,
    )
    print(f"\n  Recall check: {response['messages'][-1].content}\n")
