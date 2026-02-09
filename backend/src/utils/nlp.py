import os
import unicodedata

import fasttext
import nltk
import numpy as np
import regex as re
import stanza
from huggingface_hub import hf_hub_download
from nltk.corpus import stopwords

# ISO-2 code to NLTK language name mapping
NLTK_LANG_MAP = {
    "es": "spanish",
    "en": "english",
    "gl": "spanish",  # Galician uses Spanish stopwords as fallback
}


def _ensure_stopwords():
    """Downloads NLTK stopwords if not available."""
    for nltk_lang in set(NLTK_LANG_MAP.values()):
        try:
            stopwords.words(nltk_lang)
        except LookupError:
            nltk.download("stopwords", download_dir=os.environ.get("NLTK_DATA"))
            break  # Only need to download once, the package includes all languages


class CustomLID:
    def __init__(self, model_path, languages=-1, mode="before"):
        self.model = fasttext.load_model(model_path)
        self.output_matrix = self.model.get_output_matrix()
        self.labels = self.model.get_labels()

        # compute language_indices
        if languages != -1 and isinstance(languages, list):
            self.language_indices = [
                self.labels.index(l) for l in list(set(languages)) if l in self.labels
            ]

        else:
            self.language_indices = list(range(len(self.labels)))

        # limit labels to language_indices
        self.labels = list(np.array(self.labels)[self.language_indices])

        # predict
        self.predict = (
            self.predict_limit_after_softmax
            if mode == "after"
            else self.predict_limit_before_softmax
        )

    def predict_limit_before_softmax(self, text, k=1):
        # sentence vector
        sentence_vector = self.model.get_sentence_vector(text)

        # dot
        result_vector = np.dot(
            self.output_matrix[self.language_indices, :], sentence_vector
        )

        # softmax
        softmax_result = np.exp(result_vector - np.max(result_vector)) / np.sum(
            np.exp(result_vector - np.max(result_vector))
        )

        # top k predictions
        top_k_indices = np.argsort(softmax_result)[-k:][::-1]
        top_k_labels = [self.labels[i] for i in top_k_indices]
        top_k_probs = softmax_result[top_k_indices]

        return tuple(top_k_labels), top_k_probs

    def predict_limit_after_softmax(self, text, k=1):
        # sentence vector
        sentence_vector = self.model.get_sentence_vector(text)

        # dot
        result_vector = np.dot(self.output_matrix, sentence_vector)

        # softmax
        softmax_result = np.exp(result_vector - np.max(result_vector)) / np.sum(
            np.exp(result_vector - np.max(result_vector))
        )

        # limit softmax to language_indices
        softmax_result = softmax_result[self.language_indices]

        # top k predictions
        top_k_indices = np.argsort(softmax_result)[-k:][::-1]
        top_k_labels = [self.labels[i] for i in top_k_indices]
        top_k_probs = softmax_result[top_k_indices]

        return tuple(top_k_labels), top_k_probs


# Supported language filtering
GLOTLID_TO_ISO2 = {"spa_Latn": "es", "eng_Latn": "en", "glg_Latn": "gl"}
SUPPORTED_LABELS = [f"__label__{k}" for k in GLOTLID_TO_ISO2]
SUPPORTED_LANGUAGES = list(GLOTLID_TO_ISO2.values())

GLOTLID_MODEL_PATH = None
DETECTOR = None
lang_model_dict = {}
_NLP_INITIALIZED = False


_WORD_RE = re.compile(r"\p{L}+\p{M}*|\p{N}+")


def unicode_tokenize(text: str) -> list[str]:
    if not text:
        return []
    normalized = unicodedata.normalize("NFKC", text).lower()
    return _WORD_RE.findall(normalized)


def init_nlp() -> None:
    """
    Explicitly initializes NLP resources (not at import time).
    Call at app startup before using detect_language/extract_search_terms.
    """
    global GLOTLID_MODEL_PATH, DETECTOR, lang_model_dict, _NLP_INITIALIZED

    if _NLP_INITIALIZED:
        return

    nltk_data_dir = os.environ.get("NLTK_DATA")
    if nltk_data_dir and nltk_data_dir not in nltk.data.path:
        nltk.data.path.append(nltk_data_dir)

    _ensure_stopwords()

    GLOTLID_MODEL_PATH = hf_hub_download(
        repo_id="cis-lmu/glotlid",
        filename="model.bin",
        cache_dir=os.environ.get("HF_HOME", None),
    )
    DETECTOR = CustomLID(GLOTLID_MODEL_PATH, languages=SUPPORTED_LABELS, mode="before")

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
    _NLP_INITIALIZED = True


def _require_init() -> None:
    if not _NLP_INITIALIZED:
        raise RuntimeError(
            "NLP not initialized. Call init_nlp() at app startup."
        )


def detect_language(query: str) -> str:
    _require_init()
    labels, _ = DETECTOR.predict(query.replace("\n", " "), k=1)
    lang_code = labels[0].replace("__label__", "")
    iso2 = GLOTLID_TO_ISO2.get(lang_code, "es")
    return iso2


def extract_search_terms(text: str, lang_code: str, min_length: int = 2):
    _require_init()
    if lang_code in SUPPORTED_LANGUAGES:
        nlp_model = lang_model_dict[lang_code]
    else:
        nlp_model = lang_model_dict["es"]

    if not text or not text.strip():
        return set()

    # Get stopwords for the detected language (Spanish as default fallback)
    nltk_lang = NLTK_LANG_MAP.get(lang_code, "spanish")
    stops = set(stopwords.words(nltk_lang))

    doc = nlp_model(text)

    terms = set()
    for sentence in doc.sentences:
        for word in sentence.words:
            # Keep only nouns (common and proper)
            if word.upos not in ("NOUN", "PROPN"):
                continue
            if not word.text.isalpha():
                continue
            lemma = word.lemma.lower().strip() if word.lemma else None
            if not lemma or len(lemma) < min_length:
                continue
            # Filter stopwords
            if lemma in stops:
                continue
            terms.add(lemma)

    return terms
