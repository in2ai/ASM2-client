"""Search-related configuration that doesn't depend on Streamlit."""

from src.config.env import get_int_env

from qdrant_client.http.models import SearchParams

# Search config
PREV_CHUNKS = get_int_env('PREV_CHUNKS', 1)
NEXT_CHUNKS = get_int_env('NEXT_CHUNKS', 2)
APPROX_SEARCH_PARAMS = SearchParams(hnsw_ef=512, exact=False)

# OneDrive Microsoft Graph base URL
GRAPH = "https://graph.microsoft.com/v1.0"
