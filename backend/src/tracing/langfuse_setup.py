import logging
import os
from functools import lru_cache
from typing import Any


@lru_cache(maxsize=1)
def get_langfuse_handler() -> Any | None:
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    base_url = os.getenv("LANGFUSE_BASE_URL")

    if not public_key or not secret_key or not base_url:
        logging.info("Langfuse credentials not set; tracing disabled")
        return None

    try:
        from langfuse import Langfuse
        from langfuse.langchain import CallbackHandler

        Langfuse(
            public_key=public_key,
            secret_key=secret_key,
            host=base_url,
        )
        logging.info("Langfuse tracing enabled (host=%s)", base_url)

        return CallbackHandler()

    except Exception:
        logging.warning("Failed to initialize Langfuse; tracing disabled", exc_info=True)
        return None
