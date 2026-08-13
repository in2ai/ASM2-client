from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from treedex import FunctionLLM

from src.config.env import get_bool_env, get_env


def get_openai_llm(model: str="gpt-4o-mini", temperature: float=0):
    return ChatOpenAI(model=model, temperature=temperature)


def get_ollama_model_ref() -> str:
    ollama_model = get_env("OLLAMA_MODEL")

    if ollama_model:
        return ollama_model

    local_hf_model = get_env("LOCAL_HF_MODEL")
    local_hf_model_quant = get_env("LOCAL_HF_MODEL_QUANT")

    if not local_hf_model:
        raise ValueError(
            "USE_LOCAL_MODEL is enabled, but neither OLLAMA_MODEL nor "
            "LOCAL_HF_MODEL is configured"
        )

    model = f"hf.co/{local_hf_model}"

    if local_hf_model_quant:
        model = f"{model}:{local_hf_model_quant}"

    return model


def get_ollama_llm(temperature: float = 0):
    model = get_ollama_model_ref()

    return ChatOpenAI(
        model=model,
        base_url="http://ollama:11434/v1",
        api_key="dummy",
        temperature=temperature,
    )


def get_configured_llm():
    if get_bool_env('USE_LOCAL_MODEL', False):
        return get_ollama_llm()
    
    else:
        return get_openai_llm(get_env('OPENAI_MODEL', 'gpt-4o-mini'))

def get_configured_long_context_llm(llm):
        return FunctionLLM(lambda prompt: llm.invoke([HumanMessage(content=prompt)]).content)