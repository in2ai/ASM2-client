"""Search-related configuration that doesn't depend on Streamlit."""

from src.config.env import get_int_env

from qdrant_client.http.models import QuantizationSearchParams, SearchParams

# Search config
PREV_CHUNKS = get_int_env('PREV_CHUNKS', 1)
NEXT_CHUNKS = get_int_env('NEXT_CHUNKS', 2)
APPROX_SEARCH_PARAMS = SearchParams(hnsw_ef=512, exact=False)

# Visual search config
IMAGE_TOP_K = 3
IMAGE_NEIGHBOR_PAGES = 1
IMAGE_MAX_IN_CONTEXT = 6
IMAGE_SEARCH_PARAMS = SearchParams(
    hnsw_ef=512,
    exact=False,
    quantization=QuantizationSearchParams(rescore=True, oversampling=2.0),
)

# OneDrive Microsoft Graph base URL
GRAPH = "https://graph.microsoft.com/v1.0"
