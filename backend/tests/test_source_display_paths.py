from langchain_core.documents import Document
from src.utils.rag import get_chunk_sources


def test_dropbox_sources_show_configured_roots_even_with_shared_links():
    chunks = [Document(page_content='README', metadata={
        'id': str(index), 'source': 'dropbox', 'name': 'README.md',
        'path': 'README.md',
        'webViewLink': f'https://www.dropbox.com/home/{root}?preview=README.md',
        'permissions': {'link': f'https://www.dropbox.com/scl/fi/{index}/README.md'},
    }) for index, root in enumerate(['Project%20A/Dev', 'Project%20B/Dev'])]
    sources = get_chunk_sources(chunks, {})
    assert [source['path'] for source in sources] == ['Project A/Dev/README.md', 'Project B/Dev/README.md']
    assert sources[0]['link'] == 'https://www.dropbox.com/scl/fi/0/README.md'
