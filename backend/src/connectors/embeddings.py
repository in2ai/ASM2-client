from langchain_core.embeddings import Embeddings 
from langchain_openai import OpenAIEmbeddings
from sentence_transformers import SentenceTransformer

from src.config.env import get_env, get_bool_env


class Embedder(Embeddings):
    def __init__(self, query_prefix: str):
        self.query_prefix = query_prefix 


    def dims(self):
        ...


class OpenAIEmbedder(Embedder):
    def __init__(self, model):
        super().__init__('')
        self.model = OpenAIEmbeddings(model=model)


    def dims(self):
        return self.model.dimensions


    def embed_documents(self, texts: list[str]):
        return self.model.embed_documents(texts)


    def embed_query(self, query: str):
        return self.model.embed_query(query)
    
    
class LocalEmbedder(Embedder):
    def __init__(
        self,
        model_name: str = "sentence-transformers/all-MiniLM-L12-v2",
        query_prefix: str = "Represent this sentence for searching relevant passages: "
    ):
        super().__init__(query_prefix)

        self.model = SentenceTransformer(
            model_name,
            trust_remote_code=True
        )

    def dims(self):
        return self.model.get_sentence_embedding_dimension()

    def embed_documents(self, texts: list[str]):
        return self.model.encode(
            texts,
            batch_size=16,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        ).tolist()

    def embed_query(self, query: str):
        text = f"{self.query_prefix}{query}"

        return self.model.encode(
            text,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        ).tolist()
    

def get_configured_embeddings():
    if get_bool_env('USE_LOCAL_EMB', False):
        return LocalEmbedder(get_env('LOCAL_EMB_REPO'))
    
    else:
        return OpenAIEmbedder("text-embedding-3-small")