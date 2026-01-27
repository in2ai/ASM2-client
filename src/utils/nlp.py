import os
import unicodedata

import fasttext
import nltk
import numpy as np
import regex as re
import stanza
from huggingface_hub import hf_hub_download
from nltk.corpus import stopwords

# Mapeo de códigos ISO-2 a nombres de idioma de NLTK
NLTK_LANG_MAP = {
    "es": "spanish",
    "en": "english",
    "gl": "spanish",  # Gallego usa stopwords de español como fallback
}


def _ensure_stopwords():
    """Descarga stopwords de NLTK si no están disponibles."""
    for nltk_lang in set(NLTK_LANG_MAP.values()):
        try:
            stopwords.words(nltk_lang)
        except LookupError:
            nltk.download("stopwords")
            break  # Solo hace falta descargar una vez, el paquete incluye todos los idiomas


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


# Filter detection to only Spanish, English, and Galician
SUPPORTED_LABELS = ["__label__spa_Latn", "__label__eng_Latn", "__label__glg_Latn"]
GLOTLID_TO_ISO2 = {"spa_Latn": "es", "eng_Latn": "en", "glg_Latn": "gl"}
SUPPORTED_LANGUAGES = ["es", "en", "gl"]

GLOTLID_MODEL_PATH = None
DETECTOR = None
lang_model_dict = {}
supported_languages = SUPPORTED_LANGUAGES
_NLP_INITIALIZED = False


_WORD_RE = re.compile(r"\p{L}+\p{M}*|\p{N}+")


def unicode_tokenize(text: str) -> list[str]:
    if not text:
        return []
    normalized = unicodedata.normalize("NFKC", text).lower()
    return _WORD_RE.findall(normalized)


def init_nlp() -> None:
    """
    Inicializa recursos NLP de forma explícita (no en import).
    Llamar en el arranque de la app antes de usar detect_language/extract_search_terms.
    """
    global GLOTLID_MODEL_PATH, DETECTOR, lang_model_dict, supported_languages, _NLP_INITIALIZED

    if _NLP_INITIALIZED:
        return

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
    supported_languages = SUPPORTED_LANGUAGES
    _NLP_INITIALIZED = True


def _require_init() -> None:
    if not _NLP_INITIALIZED:
        raise RuntimeError(
            "NLP no inicializado. Llama a init_nlp() al arrancar la app."
        )


def detect_language(query: str) -> str:
    _require_init()
    labels, _ = DETECTOR.predict(query.replace("\n", " "), k=1)
    lang_code = labels[0].replace("__label__", "")
    iso2 = GLOTLID_TO_ISO2.get(lang_code, "es")
    return iso2


def extract_search_terms(text: str, lang_code: str, min_length: int = 2):
    _require_init()
    if lang_code in supported_languages:
        nlp_model = lang_model_dict[lang_code]
    else:
        nlp_model = lang_model_dict["es"]

    if not text or not text.strip():
        return set()

    # Obtener stopwords del idioma detectado (español por defecto si falla)
    nltk_lang = NLTK_LANG_MAP.get(lang_code, "spanish")
    stops = set(stopwords.words(nltk_lang))

    doc = nlp_model(text)

    terms = set()
    for sentence in doc.sentences:
        for word in sentence.words:
            # Solo conservar sustantivos (comunes y propios)
            if word.upos not in ("NOUN", "PROPN"):
                continue
            if not word.text.isalpha():
                continue
            lemma = word.lemma.lower().strip() if word.lemma else None
            if not lemma or len(lemma) < min_length:
                continue
            # Filtrar stopwords
            if lemma in stops:
                continue
            terms.add(lemma)

    return terms
