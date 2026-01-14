import stanza
from fast_langdetect import LangDetectConfig, LangDetector

config = LangDetectConfig(cache_dir="/custom/cache", model="lite")
DETECTOR = LangDetector(config)

# SPACY_MODEL = spacy.load("es_core_news_md")

lang_model_dict = {
    "es": stanza.Pipeline("es", package="ancora"),
    "en": stanza.Pipeline("en", package="eslspok"),
    "gl": stanza.Pipeline("gl", package="ctg"),
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

    # Stanza API: doc.sentences -> sentence.words -> word.lemma, word.upos
    terms = set()
    for sentence in doc.sentences:
        for word in sentence.words:
            # Skip punctuation (UPOS tag) and non-alphabetic tokens
            if word.upos == "PUNCT" or not word.text.isalpha():
                continue
            if word.lemma and len(word.lemma) >= min_length:
                terms.add(word.lemma.lower().strip())

    return terms
