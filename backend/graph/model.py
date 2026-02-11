from pathlib import Path

from dotenv.main import load_dotenv
from langchain_openai.chat_models.base import ChatOpenAI
from .tools import vectordb_search

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# ChatOpenAI reads api_key from .env automatically
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

tool_list = [vectordb_search]
llm_with_tools = llm.bind_tools(tool_list, parallel_tool_calls=False)
