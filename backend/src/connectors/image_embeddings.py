import logging
from io import BytesIO

import torch
from PIL import Image
from transformers import BitsAndBytesConfig, ColQwen2ForRetrieval, ColQwen2Processor

from src.config.env import get_env

MODEL_NAME = "Sahil-Kabir/colqwen2.5-v0.2-hf"
QUANT_MODES = ("none", "int8", "int4")
QUANT_MODE = get_env("QUANT_MODE", "int4")
SKIP_QUANT_MODULES = ["embedding_proj_layer"]


class ImageEmbedder:
    """Visual page embeddings with ColQwen2.5."""

    def __init__(self):
        """Load ColQwen2.5 onto the GPU with the configured quantization."""
        if not torch.cuda.is_available():
            raise RuntimeError(
                "VISUAL_RAG requires GPU: ColQwen2.5 on CPU is not feasible and"
                "bitsandbytes quantization requires CUDA."
            )

        quant = quantization_config()
        kwargs = {"device_map": "cuda:0"}

        if quant is not None:
            kwargs["quantization_config"] = quant
        else:
            kwargs["dtype"] = torch.bfloat16

        logging.info("Loading %s (quantization: %s)...", MODEL_NAME, QUANT_MODE)

        self.model = ColQwen2ForRetrieval.from_pretrained(MODEL_NAME, **kwargs).eval()
        self.processor = ColQwen2Processor.from_pretrained(MODEL_NAME)

    def dims(self) -> int:
        """Return the dimension of each vector, to create the collection in Qdrant."""
        return self.model.embedding_proj_layer.out_features

    def embed_images(self, images: list[bytes]) -> list[list[list[float]]]:
        """Embed a batch of pages, returning a matrix of vectors per page."""
        pages = [Image.open(BytesIO(data)).convert("RGB") for data in images]

        with torch.no_grad():
            batch = self.processor.process_images(pages, return_tensors="pt")
            out = self.model(**batch.to(self.model.device))

        return [self._to_lists(page) for page in out.embeddings]

    def embed_query(self, text: str) -> list[list[float]]:
        """Embeds the query into the same space as the pages, to compare them with MaxSim."""
        with torch.no_grad():
            batch = self.processor.process_queries([text], return_tensors="pt")
            out = self.model(**batch.to(self.model.device))

        return self._to_lists(out.embeddings[0])

    @staticmethod
    def _to_lists(embeddings) -> list[list[float]]:
        """Convert a bfloat16 GPU tensor into the plain float lists that Qdrant accepts."""
        return embeddings.cpu().float().numpy().tolist()


def quantization_config():
    """Build the bitsandbytes configuration for QUANT_MODE, or None to run in bf16."""
    if QUANT_MODE not in QUANT_MODES:
        raise ValueError(
            f"QUANT_MODE not recognized: {QUANT_MODE!r}. "
            f"Valid values: {', '.join(QUANT_MODES)}"
        )

    if QUANT_MODE == "int4":
        return BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_use_double_quant=True,
            llm_int8_skip_modules=SKIP_QUANT_MODULES,
        )

    if QUANT_MODE == "int8":
        return BitsAndBytesConfig(
            load_in_8bit=True,
            llm_int8_skip_modules=SKIP_QUANT_MODULES,
        )

    return None


def get_image_embedder() -> ImageEmbedder:
    """Load the visual embedder."""
    return ImageEmbedder()
