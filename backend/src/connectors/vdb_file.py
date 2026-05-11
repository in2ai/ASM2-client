import csv
import io
import logging

import chardet
import requests
from bs4 import BeautifulSoup
from docx import Document as DocxDocument
from dropbox.exceptions import ApiError
from openpyxl import load_workbook
from pptx import Presentation
from PyPDF2 import PdfReader

from src.config.search_config import GRAPH
from src.utils.helpers import safe_execute


def extract_docx_text(data: bytes) -> str:
    """Extraer texto de documento Word (.docx)"""
    try:
        doc = DocxDocument(io.BytesIO(data))
        paragraphs = [para.text for para in doc.paragraphs if para.text.strip()]
        tables_text = []
        for table in doc.tables:
            for row in table.rows:
                row_text = [
                    cell.text.strip() for cell in row.cells if cell.text.strip()
                ]
                if row_text:
                    tables_text.append(" | ".join(row_text))
        return "\n".join(paragraphs + tables_text).strip()
    except Exception as e:
        logging.error(f"Error while extracting DOCX: {e}")
        return None


def extract_pptx_text(data: bytes) -> list[str]:
    """Extraer texto de presentación PowerPoint (.pptx), una cadena por diapositiva."""
    try:
        prs = Presentation(io.BytesIO(data))
        slides_text = []

        for slide in prs.slides:
            slide_parts = []
            for shape in slide.shapes:
                if hasattr(shape, "text") and shape.text.strip():
                    slide_parts.append(shape.text.strip())
            slides_text.append("\n".join(slide_parts).strip())

        return slides_text
    except Exception as e:
        logging.error(f"Error while extracting PPTX: {e}")
        return None


def extract_excel_text(data: bytes) -> str:
    """Extraer texto de hoja de cálculo Excel (.xlsx, .xls)"""
    try:
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        text_rows = []
        for sheet in wb.worksheets:
            text_rows.append(f"Hoja: {sheet.title}")
            for row in sheet.iter_rows(values_only=True):
                row_values = [str(cell) if cell is not None else "" for cell in row]
                row_text = " | ".join(row_values).strip()
                if row_text and row_text != " | " * (len(row_values) - 1):
                    text_rows.append(row_text)
        return "\n".join(text_rows).strip()
    except Exception as e:
        logging.error(f"Error while extracting Excel: {e}")
        return None


def extract_html_text(data: bytes) -> str:
    """Extraer texto de documento HTML"""
    try:
        soup = BeautifulSoup(data, "lxml")
        # Eliminar elementos script y style
        for script in soup(["script", "style"]):
            script.decompose()
        text = soup.get_text(separator="\n")
        # Limpiar espacios en blanco
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return "\n".join(lines).strip()
    except Exception as e:
        logging.error(f"Error while extracting HTML: {e}")
        return None


def extract_csv_text(data: bytes) -> str:
    """Extraer texto de archivo CSV"""
    try:
        # Detectar encoding automáticamente (soporta UTF-8, Latin-1, Windows-1252, etc.)
        detected = chardet.detect(data)
        encoding = detected.get("encoding") or "utf-8"
        text = data.decode(encoding, errors="ignore")

        reader = csv.reader(io.StringIO(text))
        rows = []
        for row in reader:
            row_text = " | ".join([cell.strip() for cell in row if cell.strip()])
            if row_text:
                rows.append(row_text)
        return "\n".join(rows).strip()
    except Exception as e:
        logging.error(f"Error while extracting CSV: {e}")
        return None


def extract_pdf_text(data: bytes) -> list[str]:
    """Extraer texto de documento PDF, una cadena por página."""
    try:
        fh = io.BytesIO(data)
        reader = PdfReader(fh)
        return [(p.extract_text() or "").strip() for p in reader.pages]
    except Exception as e:
        logging.error(f"Error while extracting PDF: {e}")
        return None


class VDBFile:
    def __init__(self, metadata):
        self.metadata = metadata

    def get_text(self) -> str | list[str]: ...


class GoogleDriveFile(VDBFile):
    def __init__(self, metadata, service):
        super().__init__(metadata)
        self.service = service

    def get_text(self) -> str | list[str]:
        file_id = self.metadata["id"]
        mime_type = self.metadata["mimeType"]

        # Archivos PDF
        if mime_type == "application/pdf":
            data = safe_execute(self.service.files().get_media(fileId=file_id))
            return extract_pdf_text(data)

        # Google Docs - exportar como texto plano
        elif mime_type == "application/vnd.google-apps.document":
            data = safe_execute(
                self.service.files().export(fileId=file_id, mimeType="text/plain")
            )
            return data.decode("utf-8", errors="ignore")

        # Google Sheets - exportar como CSV
        elif mime_type == "application/vnd.google-apps.spreadsheet":
            data = safe_execute(
                self.service.files().export(fileId=file_id, mimeType="text/csv")
            )
            return extract_csv_text(data)

        # Google Slides - exportar como texto plano
        elif mime_type == "application/vnd.google-apps.presentation":
            data = safe_execute(
                self.service.files().export(fileId=file_id, mimeType="text/plain")
            )
            return data.decode("utf-8", errors="ignore")

        # Texto plano y Markdown
        elif mime_type in ("text/plain", "text/markdown"):
            data = safe_execute(self.service.files().get_media(fileId=file_id))
            return data.decode("utf-8", errors="ignore")

        # Documentos Word
        elif (
            mime_type
            == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ):
            data = safe_execute(self.service.files().get_media(fileId=file_id))
            return extract_docx_text(data)

        # Presentaciones PowerPoint
        elif (
            mime_type
            == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        ):
            data = safe_execute(self.service.files().get_media(fileId=file_id))
            return extract_pptx_text(data)

        # Hojas de cálculo Excel
        elif (
            mime_type
            == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ):
            data = safe_execute(self.service.files().get_media(fileId=file_id))
            return extract_excel_text(data)

        # Archivos HTML
        elif mime_type == "text/html":
            data = safe_execute(self.service.files().get_media(fileId=file_id))
            return extract_html_text(data)

        # Archivos CSV
        elif mime_type == "text/csv":
            data = safe_execute(self.service.files().get_media(fileId=file_id))
            return extract_csv_text(data)

        return None


class DropboxFile(VDBFile):
    def __init__(self, metadata, service):
        super().__init__(metadata)
        self.service = service

    def get_text(self) -> str | list[str]:
        file_id = self.metadata["id"]
        path_lower = self.metadata["path_lower"]
        mime_type = self.metadata["mimeType"]

        try:
            meta, resp = self.service.files_download(file_id or path_lower)
            data = resp.content

            # Archivos PDF
            if mime_type == "application/pdf":
                return extract_pdf_text(data)

            # Texto plano y Markdown
            elif mime_type in ("text/plain", "text/markdown"):
                return data.decode("utf-8", errors="ignore")

            # Documentos Word
            elif (
                mime_type
                == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ):
                return extract_docx_text(data)

            # Presentaciones PowerPoint
            elif (
                mime_type
                == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            ):
                return extract_pptx_text(data)

            # Hojas de cálculo Excel
            elif (
                mime_type
                == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ):
                return extract_excel_text(data)

            # Archivos HTML
            elif mime_type == "text/html":
                return extract_html_text(data)

            # Archivos CSV
            elif mime_type == "text/csv":
                return extract_csv_text(data)

        except ApiError:
            return None

        return None


def _ms_headers(token_dict):
    return {"Authorization": f"Bearer {token_dict['access_token']}"}


class OnedriveFile(VDBFile):
    def __init__(self, metadata, token):
        super().__init__(metadata)
        self.token = token

    def get_text(self) -> str | list[str]:
        item_id = self.metadata["id"]
        mime = self.metadata.get("mimeType", "").lower()

        headers = _ms_headers(self.token)
        url = f"{GRAPH}/me/drive/items/{item_id}/content"
        r = requests.get(url, headers=headers, timeout=60)

        if r.status_code == 403:
            return None

        r.raise_for_status()
        data = r.content

        # Archivos PDF
        if mime == "application/pdf":
            return extract_pdf_text(data)

        # Documentos Word
        elif (
            mime
            == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ):
            return extract_docx_text(data)

        # Presentaciones PowerPoint
        elif (
            mime
            == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        ):
            return extract_pptx_text(data)

        # Hojas de cálculo Excel
        elif (
            mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ):
            return extract_excel_text(data)

        # Archivos HTML
        elif mime == "text/html":
            return extract_html_text(data)

        # Archivos CSV
        elif mime == "text/csv":
            return extract_csv_text(data)

        # Texto plano y Markdown
        elif mime in ("text/plain", "text/markdown"):
            return data.decode("utf-8", errors="ignore")

        # Tipo no soportado
        return None
