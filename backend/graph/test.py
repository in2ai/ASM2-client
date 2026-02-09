"""Test script for the LangGraph agent pipeline.

Usage:
    cd backend/graph
    python test.py

Requires:
    - OPENAI_API_KEY in .env
    - NLP models downloaded (stanza, glotlid)
    - PostgreSQL running (or falls back to MemorySaver)
"""

from pathlib import Path

from agent import graph, build_graph
from langchain_core.messages import HumanMessage

from src.utils.nlp import init_nlp


def main():
    # Initialize NLP resources
    print("Initializing NLP resources...")
    init_nlp()
    print("NLP initialized.\n")

    # Save graph visualization
    try:
        png_bytes = graph.get_graph().draw_mermaid_png()
        graph_path = Path(__file__).parent / "graph_diagram.png"
        graph_path.write_bytes(png_bytes)
        print(f"Graph diagram saved to {graph_path}\n")
    except Exception as e:
        print(f"Could not save graph diagram: {e}\n")

    # Print graph structure
    print("Graph structure:")
    graph.get_graph().print_ascii()
    print()

    # Config for testing (no vectorstore/reranker/sources — agent will work without tool calls)
    config = {"configurable": {"thread_id": "test-1"}}

    # 1. Basic conversation (no tool use expected)
    print("=" * 50)
    print("Test 1: Basic greeting (no tool call expected)")
    print("=" * 50)
    print("User: Hello, how are you?")
    response = graph.invoke(
        {"messages": [HumanMessage(content="Hello, how are you?")]},
        config,
    )
    print(f"Assistant: {response['messages'][-1].content}")
    print(f"Detected language: {response.get('detected_language', 'N/A')}\n")

    # 2. Memory test — same thread should remember prior messages
    print("=" * 50)
    print("Test 2: Memory (same thread)")
    print("=" * 50)
    print("User: What did I say first?")
    response = graph.invoke(
        {"messages": [HumanMessage(content="What did I say first?")]},
        config,
    )
    print(f"Assistant: {response['messages'][-1].content}\n")

    # 3. Spanish language detection
    print("=" * 50)
    print("Test 3: Spanish language detection")
    print("=" * 50)
    config_es = {"configurable": {"thread_id": "test-2"}}
    print("User: Hola, como estas?")
    response = graph.invoke(
        {"messages": [HumanMessage(content="Hola, como estas?")]},
        config_es,
    )
    print(f"Assistant: {response['messages'][-1].content}")
    print(f"Detected language: {response.get('detected_language', 'N/A')}\n")

    # 4. Galician language detection
    print("=" * 50)
    print("Test 4: Galician language detection")
    print("=" * 50)
    config_gl = {"configurable": {"thread_id": "test-3"}}
    print("User: Boas, como estades?")
    response = graph.invoke(
        {"messages": [HumanMessage(content="Boas, como estades?")]},
        config_gl,
    )
    print(f"Assistant: {response['messages'][-1].content}")
    print(f"Detected language: {response.get('detected_language', 'N/A')}\n")

    print(f"Total messages in test-1 thread: {len(response['messages'])}")
    print("\nAll tests completed.")


if __name__ == "__main__":
    main()
