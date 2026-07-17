from langchain_openai import ChatOpenAI 
from langchain_community.chat_models import ChatLlamaCpp

from src.config.env import get_bool_env, get_env


def get_openai_llm(model: str="gpt-4o-mini", temperature: float=0):
    return ChatOpenAI(model=model, temperature=temperature)


def get_llamacpp_llm(temperature: float=0):
    LOCAL_HF_MODEL = get_env('LOCAL_HF_MODEL')
    LOCAL_HF_MODEL_QUANT = get_env('LOCAL_HF_MODEL_QUANT')

    model = f"hf.co/{LOCAL_HF_MODEL}:{LOCAL_HF_MODEL_QUANT}"

    return ChatOpenAI(
        model=model,
        base_url="http://ollama:11434/v1",
        api_key="dummy",
        temperature=temperature,
    )


def get_configured_llm():
    if get_bool_env('USE_LOCAL_MODEL', False):
        return get_llamacpp_llm()
    
    else:
        return get_openai_llm(get_env('OPENAI_MODEL', 'gpt-4o-mini'))