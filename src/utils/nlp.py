import spacy_stanza
from fast_langdetect import LangDetectConfig, LangDetector

config = LangDetectConfig(cache_dir="/custom/cache", model="lite")
DETECTOR = LangDetector(config)

# SPACY_MODEL = spacy.load("es_core_news_md")

lang_model_dict = {
    "es": spacy_stanza.load_pipeline("es"),
    "en": spacy_stanza.load_pipeline("en"),
    "gl": spacy_stanza.load_pipeline("gl"),
}

supported_languages = ["es", "en", "gl"]


def detect_language(query: str):
    global DETECTOR

    return DETECTOR.detect(query, k=1)["lang"]


def extract_search_terms(text: str, lang_code: str, min_length: int = 2):
    if lang_code in supported_languages:
        nlp_model = lang_model_dict[lang_code]
    else:
        nlp_model = lang_model_dict["es"]

    if not text or not text.strip():
        return set()

    doc = nlp_model(text)

    return {
        i.lemma_.lower().strip()
        for i in doc
        if not (i.is_stop or i.is_punct or not i.is_alpha)
        and len(i.lemma_) >= min_length
    }
