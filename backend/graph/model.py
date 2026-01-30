import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from tools.test_tool import test_tool

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

llm = ChatOpenAI(
    model="gpt-4o-mini", temperature=0, api_key=os.getenv("OPENAI_API_KEY")
)

tool_list = [test_tool]
llm_with_tools = llm.bind_tools(tool_list, parallel_tool_calls=False)
