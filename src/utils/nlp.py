import spacy

SPACY_MODEL = spacy.load('es_core_news_md')

def extract_search_terms(text: str, min_length: int = 2):
    global SPACY_MODEL

    if not text or not text.strip():
        return set()

    doc = SPACY_MODEL(text)

    return {
        i.lemma_.lower().strip() 
        for i in doc 
        if not (i.is_stop or i.is_punct or not i.is_alpha) and len(i.lemma_) >= min_length
    }