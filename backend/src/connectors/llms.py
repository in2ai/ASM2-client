from langchain_openai import ChatOpenAI 
from langchain_community.chat_models import ChatLlamaCpp

from src.config.env import get_bool_env, get_env


def get_openai_llm(model: str="gpt-4o-mini", temperature: float=0):
    return ChatOpenAI(model=model, temperature=temperature)


def get_llamacpp_llm(model: str, temperature: float=0):
    return ChatLlamaCpp(model_path=model, temperature=temperature)


def get_configured_llm():
    if get_bool_env('USE_LOCAL_MODEL', False):
        return get_llamacpp_llm(f"/app/models/{get_env('LOCAL_MODEL_FILE')}")
    
    else:
        return get_openai_llm(get_env('OPENAI_MODEL', 'gpt-4o-mini'))