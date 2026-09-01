from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from treedex import FunctionLLM

from src.config.env import get_bool_env, get_env


# Models that run with reasoning enabled by default. On /v1/chat/completions
# these reject requests that also bind function tools, unless reasoning is
# explicitly turned off (reasoning_effort="none").
REASONING_MODEL_PREFIXES = ("gpt-5", "o1", "o3", "o4")


def is_reasoning_model(model: str) -> bool:
    model = model.lower()

    return model.startswith(REASONING_MODEL_PREFIXES) and "chat" not in model


def get_openai_llm(model: str="gpt-4o-mini", temperature: float=0, reasoning_effort: str | None=None):
    if not is_reasoning_model(model):
        return ChatOpenAI(model=model, temperature=temperature)

    # The graph binds tools to this model, so reasoning has to be disabled for
    # the Chat Completions endpoint to accept the request.
    if reasoning_effort is None:
        reasoning_effort = get_env("OPENAI_REASONING_EFFORT", "none")

    if reasoning_effort != "none":
        # Only the Responses API supports reasoning together with function tools.
        return ChatOpenAI(
            model=model,
            reasoning_effort=reasoning_effort,
            use_responses_api=True,
        )

    return ChatOpenAI(model=model, temperature=temperature, reasoning_effort="none")


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


def get_configured_judge_llm():
    """Model used to judge chunk relevance, one call per retrieved chunk.

    Same model as the chat one, but always without reasoning: the judge is a
    yes/no classifier, so reasoning tokens on every chunk buy little.
    """
    if get_bool_env('USE_LOCAL_MODEL', False):
        return get_ollama_llm()

    else:
        return get_openai_llm(
            get_env('OPENAI_MODEL', 'gpt-4o-mini'), reasoning_effort="none"
        )

def get_configured_long_context_llm(llm):
        return FunctionLLM(lambda prompt: llm.invoke([HumanMessage(content=prompt)]).content)