import os
import unicodedata

import fasttext
import regex as re
import stanza
from huggingface_hub import hf_hub_download

GLOTLID_MODEL_PATH = hf_hub_download(
    repo_id="cis-lmu/glotlid",
    filename="model.bin",
    cache_dir=os.environ.get("HF_HOME", None),
)
DETECTOR = fasttext.load_model(GLOTLID_MODEL_PATH)

GLOTLID_TO_ISO2 = {"spa_Latn": "es", "eng_Latn": "en", "glg_Latn": "gl"}

lang_model_dict = {
    "es": stanza.Pipeline(
        "es",
        package="ancora",
        processors="tokenize,mwt,pos,lemma",
        download_method=None,
    ),
    "en": stanza.Pipeline(
        "en", processors="tokenize,mwt,pos,lemma", download_method=None
    ),
    "gl": stanza.Pipeline(
        "gl", package="ctg", processors="tokenize,mwt,pos,lemma", download_method=None
    ),
}

supported_languages = ["es", "en", "gl"]


_WORD_RE = re.compile(r"\p{L}+\p{M}*|\p{N}+")


def unicode_tokenize(text: str) -> list[str]:
    if not text:
        return []
    normalized = unicodedata.normalize("NFKC", text).lower()
    return _WORD_RE.findall(normalized)


def detect_language(query: str) -> str:
    labels, _ = DETECTOR.predict(query.replace("\n", " "), k=1)
    lang_code = labels[0].replace("__label__", "")
    iso2 = GLOTLID_TO_ISO2.get(lang_code, "es")
    return iso2


def extract_search_terms(text: str, lang_code: str, min_length: int = 2):
    if lang_code in supported_languages:
        nlp_model = lang_model_dict[lang_code]
    else:
        nlp_model = lang_model_dict["es"]

    if not text or not text.strip():
        return set()

    doc = nlp_model(text)

    terms = set()
    for sentence in doc.sentences:
        for word in sentence.words:
            if word.upos == "PUNCT" or not word.text.isalpha():
                continue
            if word.lemma and len(word.lemma) >= min_length:
                terms.add(word.lemma.lower().strip())

    return terms
