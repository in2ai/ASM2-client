import logging
import threading
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, LLMResult


class TokenUsageCounter(BaseCallbackHandler):
    """Totals the tokens of every model call made through the model it is attached to.

    Attaching this to the model object -- rather than passing it through a run
    config -- is what makes it count the calls the retrieval loop fans out over
    a thread pool, which no context-local callback would ever see.
    """

    def __init__(self) -> None:
        super().__init__()
        self._lock = threading.Lock()
        self.input_tokens = 0
        self.output_tokens = 0

    def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        input_tokens = 0
        output_tokens = 0

        for generations in response.generations:
            for generation in generations:
                if not isinstance(generation, ChatGeneration):
                    continue

                message = generation.message

                if not isinstance(message, AIMessage) or not message.usage_metadata:
                    continue

                input_tokens += message.usage_metadata.get("input_tokens", 0) or 0
                output_tokens += message.usage_metadata.get("output_tokens", 0) or 0

        if not (input_tokens or output_tokens):
            return

        with self._lock:
            self.input_tokens += input_tokens
            self.output_tokens += output_tokens

    @property
    def totals(self) -> tuple[int, int]:
        with self._lock:
            return self.input_tokens, self.output_tokens


def track_token_usage(llm, counter: TokenUsageCounter):
    """Return `llm` with `counter` attached, or `llm` untouched if that fails.

    Losing a token count is never a reason to lose an answer.
    """
    try:
        return llm.model_copy(update={"callbacks": [counter]})

    except Exception:
        logging.warning("Could not attach the token counter to the model", exc_info=True)

        return llm
