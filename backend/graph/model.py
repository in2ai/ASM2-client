from pathlib import Path

from dotenv.main import load_dotenv
from .tools import vectordb_search, generate_document


load_dotenv(Path(__file__).resolve().parents[2] / ".env")

tool_list = [vectordb_search, generate_document]


def get_llm_with_tools(llm):
    llm_with_tools = llm.bind_tools(tool_list, parallel_tool_calls=False)

    return llm_with_tools
