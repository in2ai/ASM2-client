from langchain_openai import ChatOpenAI 
from langchain_community.chat_models import ChatLlamaCpp

def get_openai_llm(model: str="gpt-4o-mini", temperature: float=0):
    return ChatOpenAI(model=model, temperature=temperature)

def get_llamacpp_llm(model: str, temperature: float=0):
    return ChatLlamaCpp(model_path=model, temperature=temperature)