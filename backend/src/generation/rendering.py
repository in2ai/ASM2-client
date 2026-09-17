import inspect
import logging
import re
import textwrap
from abc import ABC, abstractmethod
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas
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

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Input sanitising, shared by every renderer
#
# Renderers are fed model output, so no cell can be assumed to be a str, no row
# can be assumed to match the heading count, and no heading level can be assumed
# to be in range. ReportLab rejects ragged rows outright and str.join() raises on
# non-str cells, so this runs before anything else.
# ---------------------------------------------------------------------------

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _text(value) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        try:
            value = str(value)
        except Exception:
            return ""
    return _CONTROL_CHARS.sub("", value)


def _level(level) -> int:
    try:
        return max(1, min(6, int(level)))
    except Exception:
        return 2


def _items(items) -> list[str]:
    if items is None:
        return []
    if isinstance(items, str):
        return [_text(items)]
    try:
        return [_text(i) for i in items]
    except TypeError:
        return [_text(items)]


def _table_data(headings, rows) -> tuple[list[str], list[list[str]]]:
    """Rectangular, all-str table data."""
    headings = _items(headings)
    try:
        rows = [_items(r) for r in (rows or [])]
    except TypeError:
        rows = []
    ncols = max([len(headings)] + [len(r) for r in rows] + [1])
    headings = headings + [""] * (ncols - len(headings))
    rows = [r + [""] * (ncols - len(r)) for r in rows]
    return headings, rows


def _wrap_lines(text: str, width: int) -> list[str]:
    """Width-aware wrap that preserves indentation and hard-breaks long tokens."""
    width = max(int(width), 8)
    out: list[str] = []
    for raw in text.expandtabs(4).splitlines() or [""]:
        if not raw.strip():
            out.append("")
            continue
        indent = raw[: len(raw) - len(raw.lstrip())][: width // 2]
        body = raw.lstrip()
        wrapped = textwrap.wrap(
            body,
            max(width - len(indent), 8),
            break_long_words=True,
            break_on_hyphens=False,
        ) or [""]
        out.extend(indent + line for line in wrapped)
    return out


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
        text = _text(text)
        self.blocks.append(text.upper() if _level(level) == 1 else text)

    def paragraph(self, text):
        self.blocks.append(_text(text))

    def item_list(self, items, ordered):
        items = _items(items)
        lines = [f"{i}. {item}" if ordered else f"- {item}" for i, item in enumerate(items, 1)]
        self.blocks.append("\n".join(lines))

    def table(self, headings, rows):
        headings, rows = _table_data(headings, rows)
        lines = [" | ".join(headings)] + [" | ".join(row) for row in rows]
        self.blocks.append("\n".join(lines))

    def code_block(self, code, language):
        self.blocks.append(_text(code))

    def finish(self) -> bytes:
        return "\n\n".join(self.blocks).encode("utf-8")


# ---------------------------------------------------------------------------
# Markdown
# ---------------------------------------------------------------------------

class MarkdownRenderer(DocumentRenderer):
    def reset(self) -> None:
        self.blocks: list[str] = []

    def heading(self, text, level):
        self.blocks.append(f"{'#' * _level(level)} {_text(text)}")

    def paragraph(self, text):
        self.blocks.append(_text(text))

    def item_list(self, items, ordered):
        items = _items(items)
        lines = [f"{i}. {item}" if ordered else f"- {item}" for i, item in enumerate(items, 1)]
        self.blocks.append("\n".join(lines))

    def table(self, headings, rows):
        headings, rows = _table_data(headings, rows)

        # A pipe in a cell would silently add a column.
        def esc(cell: str) -> str:
            return cell.replace("|", "\\|").replace("\n", " ")

        header = "| " + " | ".join(esc(h) for h in headings) + " |"
        sep = "| " + " | ".join("---" for _ in headings) + " |"
        body = ["| " + " | ".join(esc(c) for c in row) + " |" for row in rows]
        self.blocks.append("\n".join([header, sep, *body]))

    def code_block(self, code, language):
        code = _text(code)
        # Longer fence than any run of backticks inside the code.
        runs = [len(m) for m in re.findall(r"`+", code)] or [0]
        fence = "`" * max(3, max(runs) + 1)
        self.blocks.append(f"{fence}{_text(language)}\n{code}\n{fence}")

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

_MARGIN = 0.9 * inch
_FRAME_PAD = 6.0  # SimpleDocTemplate's Frame default, on each side.

# The usable box, matching what the frame reports: LETTER minus margins minus
# frame padding, i.e. 470.4 x 650.4pt.
_AVAIL_W = LETTER[0] - 2 * _MARGIN - 2 * _FRAME_PAD
_AVAIL_H = LETTER[1] - 2 * _MARGIN - 2 * _FRAME_PAD

# A row taller than this reads badly even when it fits, and a row taller than the
# frame cannot be laid out at all, so past this point tables get linearised.
_ROW_LIMIT = 0.6 * _AVAIL_H

_TABLE_KW = set(inspect.signature(RLTable.__init__).parameters)


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _link_sub(m: re.Match) -> str:
    href = m.group(2).replace('"', "%22")
    return f'<link href="{href}" color="{_ACCENT_HEX}">{m.group(1)}</link>'


def _inline_markup(text: str) -> str:
    """Turn the inline Markdown our schema allows into ReportLab's mini-markup."""
    text = _escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
    text = re.sub(r"`(.+?)`", r'<font face="Courier">\1</font>', text)
    text = re.sub(r"\[(.+?)\]\((.+?)\)", _link_sub, text)
    return text


def _longest_word(text: str, font: str, size: float) -> float:
    return max((stringWidth(w, font, size) for w in text.split()), default=0.0)


def _col_widths(headings, rows, font, size, pad, avail) -> list[float]:
    """Weight columns by their natural width.

    With colWidths=None ReportLab sizes each column from its *minimum* content
    width (roughly the longest word), which is what collapsed the 8-column table
    into a 699pt row. Explicit widths are the actual fix.
    """
    ncols = len(headings)
    gutter = 2 * pad + 1  # cell padding plus the grid line
    space = max(avail - ncols * gutter, ncols * 4.0)

    natural, floors = [], []
    for c in range(ncols):
        cells = [headings[c]] + [r[c] for r in rows]
        natural.append(max((stringWidth(x, font, size) for x in cells), default=0.0) or 1.0)
        floors.append(min(max((_longest_word(x, font, size) for x in cells), default=0.0), space / ncols))

    # sqrt damping: a verbose column earns more room, but not all of it.
    weights = [n ** 0.5 for n in natural]
    total = sum(weights) or 1.0
    widths = [space * w / total for w in weights]

    # Lift anything under its unbreakable minimum, taking the slack from columns
    # that have room to spare.
    for _ in range(ncols):
        deficit = sum(max(0.0, f - w) for f, w in zip(floors, widths))
        if deficit <= 0.5:
            break
        donors = [i for i in range(ncols) if widths[i] > floors[i]]
        pool = sum(widths[i] - floors[i] for i in donors)
        if pool <= 0.5:
            break
        take = min(deficit, pool)
        for i in donors:
            widths[i] -= take * (widths[i] - floors[i]) / pool
        widths = [max(w, f) for w, f in zip(widths, floors)]

    scale = space / (sum(widths) or 1.0)
    return [w * scale + gutter for w in widths]


def _row_heights(table) -> list[float] | None:
    """Ask ReportLab what the rows measure, so we can degrade before it raises.

    None means the measurement itself failed, which is a reliable sign that
    build() would fail too.
    """
    try:
        table.wrap(_AVAIL_W, _AVAIL_H)
        return [float(h or 0.0) for h in (table._rowHeights or [])]
    except Exception:
        logger.warning("Table measurement failed", exc_info=True)
        return None


class _Layout:
    """One rung of the ladder in PdfRenderer.finish()."""

    def __init__(self, name, font_scale=1.0, tables=True, boxes=True, repeat_headers=True):
        self.name = name
        self.font_scale = font_scale
        self.tables = tables            # False: every table becomes labelled blocks
        self.boxes = boxes              # False: code blocks lose their shaded box
        self.repeat_headers = repeat_headers

    def table_font(self, ncols: int) -> float:
        base = 9.0 if ncols <= 4 else 8.0 if ncols <= 6 else 7.0 if ncols <= 9 else 6.5
        return max(5.5, base * self.font_scale)

    def table_pad(self, ncols: int) -> float:
        return 8.0 if ncols <= 4 else 4.0 if ncols <= 6 else 2.5


_LAYOUTS = (
    _Layout("full"),
    _Layout("compact", font_scale=0.85, repeat_headers=False),
    _Layout("linear", font_scale=0.85, tables=False, boxes=False, repeat_headers=False),
)


class PdfRenderer(DocumentRenderer):
    def __init__(self):
        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle("DocTitle", parent=styles["Title"], textColor=_ACCENT, spaceAfter=20))
        styles.add(ParagraphStyle("SectionHeading", parent=styles["Heading2"], textColor=_ACCENT, spaceBefore=16, spaceAfter=8))
        styles.add(ParagraphStyle("Body", parent=styles["BodyText"], spaceAfter=8, leading=15))
        styles.add(ParagraphStyle("RowTitle", parent=styles["Body"], textColor=_ACCENT, spaceBefore=8, spaceAfter=2))
        styles.add(ParagraphStyle("Field", parent=styles["Body"], leftIndent=14, spaceAfter=2, leading=13))
        self.styles = styles

    # -- collection: records semantic blocks only, so it cannot raise ---------

    def reset(self) -> None:
        self.blocks: list[tuple] = []

    def heading(self, text, level):
        self.blocks.append(("heading", _text(text), _level(level)))

    def paragraph(self, text):
        self.blocks.append(("paragraph", _text(text)))

    def item_list(self, items, ordered):
        self.blocks.append(("list", _items(items), bool(ordered)))

    def table(self, headings, rows):
        headings, rows = _table_data(headings, rows)
        self.blocks.append(("table", headings, rows))

    def code_block(self, code, language):
        self.blocks.append(("code", _text(code), _text(language) or None))

    # -- output --------------------------------------------------------------

    def finish(self) -> bytes:
        for layout in _LAYOUTS:
            pdf = self._build(layout)
            if pdf:
                return pdf
        logger.error("Every platypus layout failed for %r; using the plain-text floor",
                     self.document_title)
        try:
            return self._plain_text_pdf()
        except Exception:
            logger.exception("Plain-text PDF floor failed for %r", self.document_title)
            # Last resort. If this raises too, ReportLab is unusable and the
            # exception should propagate: a zero-byte .pdf is worse than a 500.
            return self._notice_pdf()

    def _build(self, layout: _Layout) -> bytes | None:
        try:
            story = self._story(layout)
            buf = BytesIO()
            doc = SimpleDocTemplate(
                buf, pagesize=LETTER,
                # Without these, ReportLab stamps its "(anonymous)" placeholders, and
                # PDF viewers label the tab with that instead of the document title.
                title=self.document_title or "Document",
                author="",
                subject="",
                creator="ASM2",
                topMargin=_MARGIN, bottomMargin=_MARGIN,
                leftMargin=_MARGIN, rightMargin=_MARGIN,
            )
            doc.build(story)
            return buf.getvalue()
        except Exception:
            logger.warning("PDF layout %s failed for %r; trying the next rung",
                           layout.name, self.document_title, exc_info=True)
            return None

    def _story(self, layout: _Layout) -> list:
        story: list = []
        for block in self.blocks:
            try:
                story.extend(self._flowables(block, layout))
            except Exception:
                logger.warning("Degrading a %s block to plain text", block[0], exc_info=True)
                story.extend(self._plain_block(block))
        return story or [Spacer(1, 1)]

    def _flowables(self, block: tuple, layout: _Layout) -> list:
        kind = block[0]
        if kind == "heading":
            style = "DocTitle" if block[2] == 1 else "SectionHeading"
            return [self._para(block[1], self.styles[style])]
        if kind == "paragraph":
            return [self._para(block[1], self.styles["Body"])]
        if kind == "list":
            return self._list(block[1], block[2])
        if kind == "table":
            return self._table(block[1], block[2], layout)
        if kind == "code":
            return self._code(block[1], layout)
        return []

    def _para(self, text: str, style, prefix: str = ""):
        """prefix is trusted markup; text is escaped and marked up."""
        try:
            return RLParagraph(prefix + _inline_markup(text), style)
        except Exception:
            # Markup the paragraph parser rejected: fall back to the literal.
            return RLParagraph(prefix + _escape(text), style)

    def _list(self, items, ordered):
        if not items:
            return []
        rows = [ListItem(self._para(i, self.styles["Body"])) for i in items]
        return [
            ListFlowable(rows, bulletType="1" if ordered else "bullet", leftIndent=18),
            Spacer(1, 8),
        ]

    def _table(self, headings, rows, layout: _Layout):
        if not layout.tables or not rows:
            return self._linear_table(headings, rows)

        ncols = len(headings)
        size = layout.table_font(ncols)
        pad = layout.table_pad(ncols)
        cell = ParagraphStyle("Cell", parent=self.styles["Body"],
                              fontSize=size, leading=size * 1.28, spaceAfter=0)
        head = ParagraphStyle("Head", parent=cell,
                              fontName="Helvetica-Bold", textColor=colors.white)

        header = [self._para(h, head) for h in headings]
        body = [[self._para(c, cell) for c in row] for row in rows]

        kwargs = dict(
            colWidths=_col_widths(headings, rows, cell.fontName, size, pad, _AVAIL_W),
            hAlign="LEFT",
            splitByRow=1,
        )
        if "splitInRow" in _TABLE_KW:
            # Off deliberately. Splitting inside a row makes ReportLab re-emit the
            # repeated header mid-page and leaves the continuation fragment with a
            # blank first column, so the reader sees an unnamed row. Rows are
            # capped at _ROW_LIMIT below, well under the frame height, so no row
            # can ever be too tall to place whole and this costs nothing.
            kwargs["splitInRow"] = 0
        if "emptyTableAction" in _TABLE_KW:
            # Unreachable given the guards above, but rl_config defaults this to
            # 'error'. 'ignore' degrades to a zero Spacer; 'indicate' would draw
            # red "Table(0,0)" text into a customer-facing document.
            kwargs["emptyTableAction"] = "ignore"

        t = RLTable([header, *body], **kwargs)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), _ACCENT),
            ("GRID", (0, 0), (-1, -1), 0.5, _LINE),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _ROW_SHADE]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), pad),
            ("RIGHTPADDING", (0, 0), (-1, -1), pad),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))

        heights = _row_heights(t)
        if heights is None or (heights and max(heights) > _ROW_LIMIT):
            return self._linear_table(headings, rows)

        # repeatRows re-emits the header on every page, so the header itself has
        # to be small enough to leave room for body rows.
        header_h = heights[0] if heights else 0.0
        t.repeatRows = 1 if (layout.repeat_headers and 0 < header_h < 0.3 * _AVAIL_H) else 0
        return [t, Spacer(1, 10)]

    def _linear_table(self, headings, rows):
        """One labelled block per row.

        Paragraphs always split across pages, so this shape cannot overflow a
        frame no matter how wide or verbose the table was.
        """
        if not rows:
            return []
        flow: list = [Spacer(1, 4)]
        for n, row in enumerate(rows, 1):
            title = row[0].strip() if row else ""
            flow.append(RLParagraph(f"<b>{_escape(title or str(n))}</b>", self.styles["RowTitle"]))
            for h, c in zip(headings, row):
                if not c.strip() or c == title:
                    continue
                label = f"<b>{_escape(h)}:</b> " if h.strip() else ""
                flow.append(self._para(c, self.styles["Field"], prefix=label))
        flow.append(Spacer(1, 8))
        return flow

    def _code(self, code: str, layout: _Layout):
        base = self.styles["Code"]
        size = max(6.0, base.fontSize * layout.font_scale)
        style = ParagraphStyle("CodeBox", parent=base, fontSize=size, leading=size * 1.22)
        pad = 10.0
        inner = _AVAIL_W - 2 * pad - 2

        # Exact for Courier, a fair approximation otherwise. Preformatted does no
        # wrapping of its own, and textwrap on a character count guessed at 90 let
        # long lines run off the page.
        char_w = (stringWidth("M" * 20, style.fontName, size) / 20) or (size * 0.6)
        lines = _wrap_lines(code, int(inner / char_w))

        if not layout.boxes:
            return [Preformatted("\n".join(lines), style), Spacer(1, 10)]

        # One box per page-sized chunk. A single-cell table is one atomic row, so
        # a code block longer than a page would otherwise be a LayoutError.
        per_page = max(1, int((_AVAIL_H - 6 * pad) / style.leading))
        flow: list = []
        for i in range(0, max(len(lines), 1), per_page):
            chunk = "\n".join(lines[i:i + per_page]) or " "
            box = RLTable([[Preformatted(chunk, style)]], colWidths=[_AVAIL_W - 2], hAlign="LEFT")
            box.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), _CODE_BG),
                ("BOX", (0, 0), (-1, -1), 0.5, _LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), pad),
                ("RIGHTPADDING", (0, 0), (-1, -1), pad),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            flow.extend([box, Spacer(1, 10)])
        return flow

    def _plain_block(self, block: tuple) -> list:
        """Any block as escaped Body paragraphs, with no markup left to misparse."""
        kind, body = block[0], self.styles["Body"]
        if kind == "heading":
            return [RLParagraph(_escape(block[1]), self.styles["SectionHeading"])]
        if kind == "table":
            headings, rows = block[1], block[2]
            out = []
            for row in rows:
                joined = " - ".join(f"{h}: {c}" if h.strip() else c
                                    for h, c in zip(headings, row) if c.strip())
                out.append(RLParagraph(_escape(joined), body))
            return out
        if kind == "list":
            return [RLParagraph(_escape(f"- {i}"), body) for i in block[1]]
        if kind == "code":
            return [RLParagraph(_escape(line) or " ", self.styles["Code"])
                    for line in _wrap_lines(block[1], 96)]
        return [RLParagraph(_escape(block[1]), body)]

    # -- floors: no platypus, so no layout engine and no LayoutError ---------

    def _text_lines(self, cols: int) -> list[str]:
        out: list[str] = []
        if self.document_title:
            out += [self.document_title, "=" * min(cols, len(self.document_title)), ""]
        for block in self.blocks:
            kind = block[0]
            if kind == "heading":
                out += ["", block[1].upper() if block[2] == 1 else block[1], ""]
            elif kind == "paragraph":
                out += _wrap_lines(block[1], cols) + [""]
            elif kind == "list":
                for n, item in enumerate(block[1], 1):
                    bullet = f"{n}. " if block[2] else "- "
                    wrapped = _wrap_lines(item, cols - len(bullet)) or [""]
                    out.append(bullet + wrapped[0])
                    out += [" " * len(bullet) + w for w in wrapped[1:]]
                out.append("")
            elif kind == "table":
                headings, rows = block[1], block[2]
                for row in rows:
                    for h, c in zip(headings, row):
                        if c.strip():
                            out += _wrap_lines(f"{h}: {c}" if h.strip() else c, cols)
                    out.append("")
            elif kind == "code":
                out += _wrap_lines(block[1], cols) + [""]
        return out

    def _plain_text_pdf(self) -> bytes:
        buf = BytesIO()
        c = Canvas(buf, pagesize=LETTER)
        c.setTitle(self.document_title or "Document")
        c.setCreator("ASM2")
        font, size, leading = "Courier", 9.0, 11.0
        char_w = stringWidth("M", font, size) or 5.4
        cols = max(20, int((LETTER[0] - 2 * _MARGIN) / char_w))
        y = LETTER[1] - _MARGIN
        c.setFont(font, size)
        for line in self._text_lines(cols):
            if y < _MARGIN:
                c.showPage()
                c.setFont(font, size)
                y = LETTER[1] - _MARGIN
            # Base-14 fonts only cover WinAnsi; substitute rather than fail.
            safe = line.encode("latin-1", "replace").decode("latin-1")
            c.drawString(_MARGIN, y, safe[:cols])
            y -= leading
        c.showPage()
        c.save()
        return buf.getvalue()

    def _notice_pdf(self) -> bytes:
        buf = BytesIO()
        c = Canvas(buf, pagesize=LETTER)
        c.setTitle(self.document_title or "Document")
        c.setFont("Helvetica", 11)
        c.drawString(_MARGIN, LETTER[1] - _MARGIN, "This document could not be rendered as a PDF.")
        c.showPage()
        c.save()
        return buf.getvalue()