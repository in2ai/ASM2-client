import json
from typing import Annotated
from pydantic import BaseModel, Field

from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
    BaseMessage,
)

from src.generation.model import Document, Section


def serialize_messages(messages: list[BaseMessage]) -> str:
    """Serialize LangChain messages into an LLM-friendly transcript."""

    parts: list[str] = []

    for message in messages:
        if isinstance(message, SystemMessage):
            parts.append(
                f"""<system>
{message.content}
</system>"""
            )

        elif isinstance(message, HumanMessage):
            parts.append(
                f"""<user>
{message.content}
</user>"""
            )

        elif isinstance(message, AIMessage):
            # Assistant text
            if message.content:
                parts.append(
                    f"""<assistant>
{message.content}
</assistant>"""
                )

            # Tool calls
            for tool_call in message.tool_calls:
                args = json.dumps(tool_call["args"], indent=2, ensure_ascii=False)

                parts.append(
                    f"""<tool_call name="{tool_call['name']}" id="{tool_call['id']}">
{args}
</tool_call>"""
                )

        elif isinstance(message, ToolMessage):
            parts.append(
                f"""<tool_result id="{message.tool_call_id}" name="{message.name or ''}">
{message.content}
</tool_result>"""
            )

        else:
            parts.append(
                f"""<message type="{message.type}">
{message.content}
</message>"""
            )

    return "\n\n".join(parts)


class SectionPlan(BaseModel):
    heading: Annotated[
        str,
        Field(description="This section's heading, as plain text -- no leading '#' or Markdown."),
    ]
    description: Annotated[
        str,
        Field(
            description=(
                "One or two sentences briefing whoever drafts this section on what "
                "it should cover. This is a writing brief, not part of the document."
            )
        ),
    ]
 
 
class DocumentOutline(BaseModel):
    sufficient: Annotated[
        bool,
        Field(
            description=(
                "Whether the context contains enough information to produce a useful "
                "document for this query. Judge this before planning any sections."
            )
        ),
    ]
    missing_info: Annotated[
        str | None,
        Field(default=None, description="If not sufficient, what's missing from the context."),
    ]
    suggested_searches: Annotated[
        list[str],
        Field(
            default_factory=list,
            description=(
                "If not sufficient, one or more vector-database search queries that would "
                "likely retrieve what's missing. If the gap spans more than one distinct "
                "topic or entity, give a separate, focused query for each one instead of "
                "combining them into a single query -- a query mixing unrelated topics "
                "embeds poorly and retrieves worse results than several narrow ones. "
                "Write each query in the same language as the original query."
            ),
        ),
    ]
    title: Annotated[
        str | None,
        Field(
            default=None,
            description="The document's title, as plain text -- no leading '#' or Markdown. Only if sufficient.",
        ),
    ]
    sections: Annotated[
        list[SectionPlan],
        Field(default_factory=list, description="The document's planned sections, in reading order. Only if sufficient."),
    ]
 
 
class InsufficientContextError(Exception):
    """Raised when the context doesn't support the requested document."""
 
    def __init__(self, missing_info: str | None, suggested_searches: list[str]):
        self.missing_info = missing_info
        self.suggested_searches = suggested_searches
        super().__init__(missing_info or "Context is insufficient for this query.")
 
 
_OUTLINE_SYSTEM = """You are an expert technical writer planning the structure of a document. Given a context and a query, produce a `DocumentOutline`.
 
The user will provide:
1. A conversation (messages, tool calls, and tool results).
2. A query describing the document to produce.
 
First, judge sufficiency:
- Set `sufficient` to false only if the context is missing the core information the query is actually asking about -- not because some peripheral detail is thin. A document that covers 80% of the query well is sufficient; note the remaining gap in the document itself rather than blocking on it.
- If `sufficient` is false, explain the gap in `missing_info`. In `suggested_searches`, give one or more specific vector-database queries that would likely retrieve what's missing -- one focused query per distinct topic or entity if the gap covers more than one. For example, if a company overview is missing both staff bios and past projects, give one query for staff and a separate query for projects, not a single query combining both. Write each query in the same language as the original query. Leave `title` and `sections` empty.
- If `sufficient` is true, leave `missing_info` and `suggested_searches` empty.
 
If sufficient, plan the document:
- Give it a specific, descriptive title, not a generic one like "Report."
- Split into sections by topic; start a new section when the topic changes.
- Each section's description is a brief for its writer: what to cover. Keep sections non-overlapping -- if two would cover the same ground, merge them or split the topic differently.
- Don't plan a section for a single short point; fold it into a neighboring section.
- Prefer a small number of well-scoped sections over many thin ones.
- Organize by topic, not by the chronological order of the conversation.
 
Output only a valid `DocumentOutline` object."""
 
 
_SECTION_SYSTEM = """You are an expert technical writer drafting one section of a larger document. You'll be given the document's title, the full outline, and which section is yours -- produce a `Section` for it: a heading and its content.
 
Content:
- Write only your section. The outline shows what the other sections cover -- don't repeat that material here, even if it's relevant to the context.
- Don't restate the document title or write an introduction to the whole document; other sections handle that if it's needed.
- Prioritize accuracy over completeness. Use only what the context supports. Never invent details or present an assumption as a fact.
- Preserve concrete technical detail: code, commands, configuration values, metrics, error messages, and results.
- When describing a decision, lead with the outcome, then the rationale if the context has one.
- Most sections should open with at least one paragraph of prose before a list, table, or code block appears.
 
Choosing a block type:
- `Paragraph` -- narrative prose developing one idea.
- `TextList` -- a set of discrete items: steps, options, recommendations.
- `Table` -- data that reads better as rows and columns.
- `CodeBlock` -- code, commands, configuration, or log/error output, preserved verbatim.
 
If you notice yourself writing something like "the options are (1) X, (2) Y, (3) Z" inside a paragraph, stop and use a `TextList` instead.
 
Markdown:
Text fields may use inline Markdown for emphasis (bold, italic, code, links). Do not put a heading ('#'), a list marker ('-', '*', '1.'), a table row ('|...|'), or a code fence ('```') inside `Paragraph.text` -- use the matching block type instead. The section heading is plain text, with no leading '#'.
 
Writing style:
- Write concise, professional prose. Prefer complete sentences over fragments. Don't repeat the same information more than once.
 
Before finishing, double-check that no `Paragraph.text` is hiding a list, heading, or table.
 
Output only a valid `Section` object."""
 
 
class DocumentIssue(BaseModel):
    sections: Annotated[
        list[str],
        Field(
            description=(
                "The exact heading(s) of the existing section(s) this issue involves. "
                "One heading for an issue confined to a single section (e.g. the wrong "
                "block type for its content). More than one for anything that spans "
                "sections: redundancy, contradiction, inconsistent terminology, or a "
                "pair that should merge."
            )
        ),
    ]
    issue: Annotated[str, Field(description="What's wrong, specifically.")]
    fix: Annotated[
        str,
        Field(
            description=(
                "A concrete instruction for how to fix it -- specific enough to hand "
                "directly to whoever edits the affected section(s), with no other context."
            )
        ),
    ]
 
 
class DocumentCritique(BaseModel):
    issues: Annotated[
        list[DocumentIssue],
        Field(
            default_factory=list,
            description=(
                "Issues found. Leave empty if the document is already well-organized "
                "and consistent -- don't invent problems to have something to report."
            ),
        ),
    ]
    revised_title: Annotated[
        str | None,
        Field(
            default=None,
            description="A better title, only if the current one no longer fits well. Otherwise null.",
        ),
    ]
 
 
class RevisedSections(BaseModel):
    sections: Annotated[
        list[Section],
        Field(
            description=(
                "The corrected section(s), in reading order. Return however many the "
                "fix actually needs -- fewer than you were given if merging, more if "
                "splitting, the same number for a phrasing or formatting fix."
            )
        ),
    ]
 
 
_CRITIQUE_SYSTEM = """You are an expert editor reviewing a finished document for structural issues -- the kind only visible once every section actually exists, not from planning descriptions. You will not see the original source material; judge the document only against itself and the query it's meant to satisfy.
 
Look for:
- Redundant or overlapping content between sections.
- Contradictions between sections.
- Inconsistent terminology or naming for the same thing across sections.
- A section too thin to stand alone, or sprawling across more than one real topic -- note whether it should merge with a neighbor or split.
- A section using a suboptimal presentation for its actual content now that it exists -- e.g. a paragraph enumerating parallel items that would read better as a list or table, or a table forcing together things that aren't really parallel.
- Whether the overall structure still serves the original query.
 
For each issue, name the exact heading(s) of the section(s) involved, and give a fix specific enough to hand directly to whoever makes the edit.
 
If the document is already well-organized and consistent, return an empty `issues` list.
 
Output only a valid `DocumentCritique` object."""
 
 
_REVISION_SYSTEM = """You are an expert technical editor. You'll be given one or more sections of a document, already drafted, plus a list of specific issues a review found in them. Fix exactly those issues and return the corrected section(s).
 
- Address every issue listed. If an issue says two sections should merge, or one should split, return however many sections the fixed version actually needs -- not necessarily the number you were given.
- Don't touch anything the issues didn't flag. This is a targeted fix, not a rewrite from scratch -- preserve accurate, unflagged content as-is.
- Follow the same conventions the sections were already drafted with: `Paragraph` for prose, `TextList` for discrete items, `Table` for rows and columns, `CodeBlock` for verbatim code or commands. Inline Markdown for emphasis is fine; no heading, list, or table syntax hidden inside `Paragraph.text`.
 
Output only a valid `RevisedSections` object."""
 
 
def _format_outline(outline: DocumentOutline) -> str:
    return "\n".join(f"- {s.heading}: {s.description}" for s in outline.sections)
 
 
def generate_document_from_context(llm, query: str, messages: list) -> Document:
    context = serialize_messages(messages)
 
    # Stage 1: judge sufficiency, then plan a title and a writing brief per section.
    outline = llm.with_structured_output(DocumentOutline).invoke([
        SystemMessage(content=_OUTLINE_SYSTEM),
        HumanMessage(content=f"Query: {query}\n\nContext:\n\n{context}"),
    ])
 
    if not outline.sufficient:
        raise InsufficientContextError(outline.missing_info, outline.suggested_searches)
 
    # Stage 2: draft every section in parallel, each aware of the full outline.
    outline_text = _format_outline(outline)
    section_inputs = [
        [
            SystemMessage(content=_SECTION_SYSTEM),
            HumanMessage(
                content=(
                    f"Query: {query}\n\n"
                    f"Document title: {outline.title}\n\n"
                    f"Full outline:\n{outline_text}\n\n"
                    f"Write the section: {plan.heading}\n"
                    f"Brief: {plan.description}\n\n"
                    f"Context:\n\n{context}"
                )
            ),
        ]
        for plan in outline.sections
    ]
    sections = llm.with_structured_output(Section).batch(section_inputs)
 
    # Force each heading to match the plan exactly
    for section, plan in zip(sections, outline.sections):
        section.heading = plan.heading
 
    document = Document(title=outline.title, sections=sections)
 
    # Stage 3: critique the assembled document and fix it
    critique = llm.with_structured_output(DocumentCritique).invoke([
        SystemMessage(content=_CRITIQUE_SYSTEM),
        HumanMessage(content=f"Query: {query}\n\nDocument:\n\n{document.model_dump_json(indent=2)}"),
    ])
 
    title = critique.revised_title or document.title
    if not critique.issues:
        return Document(title=title, sections=document.sections)
 
    flagged_headings = {h for issue in critique.issues for h in issue.sections}
    flagged_indices = [i for i, s in enumerate(document.sections) if s.heading in flagged_headings]
    
    if not flagged_indices:
        return Document(title=title, sections=document.sections)
 
    flagged_sections = [document.sections[i] for i in flagged_indices]
    issues_text = "\n".join(
        f"- Involves: {', '.join(issue.sections)}\n  Issue: {issue.issue}\n  Fix: {issue.fix}"
        for issue in critique.issues
    )
    flagged_json = json.dumps([s.model_dump() for s in flagged_sections], indent=2, ensure_ascii=False)
 
    revision = llm.with_structured_output(RevisedSections).invoke([
        SystemMessage(content=_REVISION_SYSTEM),
        HumanMessage(
            content=(
                f"Query: {query}\n\n"
                f"Issues found:\n{issues_text}\n\n"
                f"Sections to fix:\n\n{flagged_json}"
            )
        ),
    ])
 
    flagged_set = set(flagged_indices)
    first_flagged = min(flagged_indices)
    final_sections: list[Section] = []
    
    for i, section in enumerate(document.sections):
        if i not in flagged_set:
            final_sections.append(section)

        elif i == first_flagged:
            final_sections.extend(revision.sections)
 
    return Document(title=title, sections=final_sections)