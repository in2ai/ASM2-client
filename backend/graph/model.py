from pathlib import Path

from dotenv.main import load_dotenv
from langchain_openai.chat_models.base import ChatOpenAI

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# ChatOpenAI reads api_key from .env automatically
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, streaming=True)
