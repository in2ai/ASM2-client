import re
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class DocumentGenerationSchema(BaseModel):
    query: str
    format: Literal["pdf", "markdown", "txt", "docx", "csv"] = Field(
        description="The action to perform"
    )

# Document model

class Paragraph(BaseModel):
    text: Annotated[
        str,
        Field(
            description=(
                "One paragraph of prose. Inline Markdown (bold, italic, "
                "code, links) is fine. Do not use Markdown headings (#), "
                "list markers (-, *, 1.), or table rows (|...|) here -- use "
                "a Section heading, a TextList, or a Table instead."
            )
        ),
    ]
 
    def render(self, renderer) -> None:
        renderer.paragraph(self.text)
 
 
class TextList(BaseModel):
    ordered: Annotated[
        bool,
        Field(
            default=False,
            description="True for a numbered list, False for a bulleted list.",
        ),
    ]
    items: Annotated[
        list[str],
        Field(description="The items in this list, in order."),
    ]
 
    def render(self, renderer) -> None:
        renderer.item_list(self.items, self.ordered)
 
 
class Table(BaseModel):
    headings: Annotated[
        list[str],
        Field(description="Column headings, in order."),
    ]
    rows: Annotated[
        list[list[str]],
        Field(
            description=(
                "Table rows, in order. Each inner list is one row and "
                "should have one value per heading."
            )
        ),
    ]
 
    def render(self, renderer) -> None:
        renderer.table(self.headings, self.rows)
 
 
class CodeBlock(BaseModel):
    code: Annotated[
        str,
        Field(description="The exact code, command, configuration, or log/error text."),
    ]
    language: Annotated[
        str | None,
        Field(
            default=None,
            description="e.g. 'python', 'bash', 'json'. Use null if there isn't one.",
        ),
    ]
 
    def render(self, renderer) -> None:
        renderer.code_block(self.code, self.language)
 
 
class Section(BaseModel):
    heading: Annotated[
        str,
        Field(description="This section's heading, as plain text -- no leading '#' or Markdown."),
    ]
    content: Annotated[
        list[Paragraph | TextList | Table | CodeBlock],
        Field(description="This section's content, in reading order."),
    ]
 
    def render(self, renderer) -> None:
        renderer.heading(self.heading, level=2)

        for block in self.content:
            block.render(renderer)
 
 
class Document(BaseModel):
    title: Annotated[
        str,
        Field(description="The document's title, as plain text -- no leading '#' or Markdown."),
    ]
    sections: Annotated[
        list[Section],
        Field(description="The document's sections, in reading order."),
    ]
 
    def render(self, renderer) -> None:
        renderer.heading(self.title, level=1)

        for section in self.sections:
            section.render(renderer)