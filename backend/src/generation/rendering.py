import re
import textwrap
from abc import ABC, abstractmethod
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    Paragraph as RLParagraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table as RLTable,
    TableStyle,
)

from src.generation.model import Document


class DocumentRenderer(ABC):
    # Document-level metadata, for formats that can carry it. Set per render()
    # rather than in reset(), which subclasses override without calling up.
    document_title: str = ""

    def render(self, document: Document) -> bytes:
        self.reset()
        self.document_title = document.title
        document.render(self)
        return self.finish()

    def reset(self) -> None:
        pass

    @abstractmethod
    def finish(self) -> bytes: ...

    @abstractmethod
    def heading(self, text: str, level: int) -> None: ...

    @abstractmethod
    def paragraph(self, text: str) -> None: ...

    @abstractmethod
    def item_list(self, items: list[str], ordered: bool) -> None: ...

    @abstractmethod
    def table(self, headings: list[str], rows: list[list[str]]) -> None: ...

    @abstractmethod
    def code_block(self, code: str, language: str | None) -> None: ...


# ---------------------------------------------------------------------------
# Plain text
# ---------------------------------------------------------------------------

class TxtRenderer(DocumentRenderer):
    def reset(self) -> None:
        self.blocks: list[str] = []

    def heading(self, text, level):
        self.blocks.append(text.upper() if level == 1 else text)

    def paragraph(self, text):
        self.blocks.append(text)

    def item_list(self, items, ordered):
        lines = [f"{i}. {item}" if ordered else f"- {item}" for i, item in enumerate(items, 1)]
        self.blocks.append("\n".join(lines))

    def table(self, headings, rows):
        lines = [" | ".join(headings)] + [" | ".join(row) for row in rows]
        self.blocks.append("\n".join(lines))

    def code_block(self, code, language):
        self.blocks.append(code)

    def finish(self) -> bytes:
        return "\n\n".join(self.blocks).encode("utf-8")


# ---------------------------------------------------------------------------
# Markdown
# ---------------------------------------------------------------------------

class MarkdownRenderer(DocumentRenderer):
    def reset(self) -> None:
        self.blocks: list[str] = []

    def heading(self, text, level):
        self.blocks.append(f"{'#' * level} {text}")

    def paragraph(self, text):
        self.blocks.append(text)

    def item_list(self, items, ordered):
        lines = [f"{i}. {item}" if ordered else f"- {item}" for i, item in enumerate(items, 1)]
        self.blocks.append("\n".join(lines))

    def table(self, headings, rows):
        header = "| " + " | ".join(headings) + " |"
        sep = "| " + " | ".join("---" for _ in headings) + " |"
        body = ["| " + " | ".join(row) + " |" for row in rows]
        self.blocks.append("\n".join([header, sep, *body]))

    def code_block(self, code, language):
        self.blocks.append(f"```{language or ''}\n{code}\n```")

    def finish(self) -> bytes:
        return "\n\n".join(self.blocks).encode("utf-8")


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

_ACCENT_HEX = "#2b3a55"
_ACCENT = colors.HexColor(_ACCENT_HEX)
_ROW_SHADE = colors.HexColor("#f4f4f6")
_CODE_BG = colors.HexColor("#f5f5f5")
_LINE = colors.HexColor("#cccccc")


def _inline_markup(text: str) -> str:
    """Turn the inline Markdown our schema allows into ReportLab's mini-markup."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
    text = re.sub(r"`(.+?)`", r'<font face="Courier">\1</font>', text)
    text = re.sub(r"\[(.+?)\]\((.+?)\)", rf'<link href="\2" color="{_ACCENT_HEX}">\1</link>', text)
    return text


def _wrap_code(code: str, width: int = 90) -> str:
    """Preformatted text doesn't wrap on its own, so long lines need help."""
    return "\n".join(
        "\n".join(textwrap.wrap(line, width, break_long_words=False) or [""])
        for line in code.splitlines()
    )


class PdfRenderer(DocumentRenderer):
    def __init__(self):
        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle("DocTitle", parent=styles["Title"], textColor=_ACCENT, spaceAfter=20))
        styles.add(ParagraphStyle("SectionHeading", parent=styles["Heading2"], textColor=_ACCENT, spaceBefore=16, spaceAfter=8))
        styles.add(ParagraphStyle("Body", parent=styles["BodyText"], spaceAfter=8, leading=15))
        styles.add(ParagraphStyle("TableHeader", parent=styles["Body"], textColor=colors.white, fontName="Helvetica-Bold", spaceAfter=0))
        self.styles = styles

    def reset(self) -> None:
        self.story: list = []

    def heading(self, text, level):
        style = "DocTitle" if level == 1 else "SectionHeading"
        self.story.append(RLParagraph(_inline_markup(text), self.styles[style]))

    def paragraph(self, text):
        self.story.append(RLParagraph(_inline_markup(text), self.styles["Body"]))

    def item_list(self, items, ordered):
        rows = [ListItem(RLParagraph(_inline_markup(i), self.styles["Body"])) for i in items]
        self.story.append(ListFlowable(rows, bulletType="1" if ordered else "bullet", leftIndent=18))
        self.story.append(Spacer(1, 8))

    def table(self, headings, rows):
        header = [RLParagraph(h, self.styles["TableHeader"]) for h in headings]
        body = [[RLParagraph(_inline_markup(c), self.styles["Body"]) for c in row] for row in rows]
        t = RLTable([header, *body], hAlign="LEFT", repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), _ACCENT),
            ("GRID", (0, 0), (-1, -1), 0.5, _LINE),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _ROW_SHADE]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        self.story.append(t)
        self.story.append(Spacer(1, 10))

    def code_block(self, code, language):
        box = RLTable([[Preformatted(_wrap_code(code), self.styles["Code"])]], colWidths=[6.3 * inch], hAlign="LEFT")
        box.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), _CODE_BG),
            ("BOX", (0, 0), (-1, -1), 0.5, _LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        self.story.append(box)
        self.story.append(Spacer(1, 10))

    def finish(self) -> bytes:
        buf = BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=LETTER,
            # Without these, ReportLab stamps its "(anonymous)" placeholders, and
            # PDF viewers label the tab with that instead of the document title.
            title=self.document_title,
            author="",
            subject="",
            creator="ASM2",
            topMargin=0.9 * inch, bottomMargin=0.9 * inch,
            leftMargin=0.9 * inch, rightMargin=0.9 * inch,
        )
        doc.build(self.story)
        return buf.getvalue()