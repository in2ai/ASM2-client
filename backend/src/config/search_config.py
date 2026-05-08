"""Search-related configuration that doesn't depend on Streamlit."""

import os

from qdrant_client.http.models import SearchParams

# Search config
APPROX_SEARCH_PARAMS = SearchParams(hnsw_ef=512, exact=False)

# OneDrive Microsoft Graph base URL
GRAPH = "https://graph.microsoft.com/v1.0"
