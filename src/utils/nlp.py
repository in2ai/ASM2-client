import spacy_stanza
import stanza

# Temporalmente a descargar aquí, luego se descargarán en build.
stanza.download("en")
stanza.download("es")
stanza.download("gl")

# SPACY_MODEL = spacy.load("es_core_news_md")

lang_model_dict = {
    "es": spacy_stanza.load_pipeline("es"),
    "en": spacy_stanza.load_pipeline("en"),
    "gl": spacy_stanza.load_pipeline("gl"),
}

supported_languages = ["es", "en", "gl"]


def extract_search_terms(lang_code: str, text: str, min_length: int = 2):
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
