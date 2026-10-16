"""Cross-paper research synthesis.

Unlike the previous implementation (which concatenated abstracts), this
retrieves evidence per paper via vector search, groups evidence by section
type (methods / results / limitations), and produces a comparison grounded in
cited chunks. Uses the LLM when configured, else a deterministic comparator.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.embeddings import get_embedding_service
from app.services.graphrag import _extractive_answer, _generate_llm, validate_citations
from app.services.vector_store import vector_search

SECTION_HINTS = {
    "method": ("method", "approach", "model", "architecture", "experiment", "procedure"),
    "finding": ("result", "finding", "show", "achiev", "outperform", "accuracy", "improve"),
    "limitation": ("limitation", "however", "fail", "drawback", "future work", "constraint"),
}

logger = logging.getLogger(__name__)


def _classify(text_content: str) -> str:
    low = text_content.lower()
    scores = {k: sum(1 for h in hs if h in low) for k, hs in SECTION_HINTS.items()}
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 0 else "general"


def _clean_evidence(content: str | None) -> str:
    """Remove common PDF extraction artifacts before evidence is shown/modelled."""
    value = re.sub(r"\s+", " ", content or "").strip()
    value = re.sub(r"\b(Abstract)\s*\1\b", r"\1", value, flags=re.IGNORECASE)
    value = re.sub(r"\b(Abstract|Introduction|Conclusion)\s*\1\b", r"\1", value, flags=re.IGNORECASE)
    value = re.sub(r"\s+([,.;:!?])", r"\1", value)
    return value


def _topic_terms(title: str | None, abstract: str | None) -> set[str]:
    stop = {
        "about", "after", "based", "between", "from", "into", "paper", "study",
        "their", "these", "this", "using", "with", "work", "approach", "analysis",
        "method", "methods", "result", "results", "study", "research",
    }
    words = re.findall(r"[a-z0-9]{3,}", f"{title or ''} {abstract or ''}".lower())
    return {word for word in words if word not in stop}


def _topic_overlap(papers_meta) -> float:
    terms = [_topic_terms(p.title, p.abstract) for p in papers_meta]
    if len(terms) < 2 or any(not group for group in terms):
        return 0.0
    shared = set.intersection(*terms)
    union = set.union(*terms)
    return len(shared) / max(len(union), 1)


def gather_paper_evidence(
    db: Session,
    paper_id: int,
    focus_query: str,
    per_paper: int = 4,
) -> list[dict[str, Any]]:
    title_row = db.execute(
        text("SELECT title FROM papers WHERE id=:pid"), {"pid": paper_id}
    ).fetchone()
    query = focus_query
    if title_row and title_row.title:
        query = f"{focus_query} {title_row.title}"

    try:
        emb = get_embedding_service().embed_one(query)
        hits = vector_search(db, emb, limit=per_paper, min_score=0.1)
        hits = [h for h in hits if h["paper_id"] == paper_id]
    except Exception:
        # Synthesis should still work for papers without indexed vectors or
        # when the local embedding model is unavailable. Try their chunks
        # directly below, then fall back to metadata-only comparison.
        logger.exception("Vector evidence lookup failed for paper %s", paper_id)
        hits = []

    # Fallback: top chunks by recency of index (paper has no semantic match)
    if not hits:
        try:
            rows = db.execute(
                text(
                    "SELECT id AS chunk_id, paper_id, content "
                    "FROM chunks WHERE paper_id=:pid "
                    "ORDER BY chunk_index LIMIT :lim"
                ),
                {"pid": paper_id, "lim": per_paper},
            ).fetchall()
        except Exception:
            logger.exception("Chunk lookup failed for paper %s", paper_id)
            rows = []
        hits = [
            {
                "chunk_id": r.chunk_id,
                "paper_id": r.paper_id,
                "content": r.content,
                "score": 0.0,
            }
            for r in rows
        ]
    for h in hits:
        h["content"] = _clean_evidence(h.get("content"))
        h["aspect"] = _classify(h.get("content", ""))
    return hits


def synthesize_papers(
    db: Session,
    paper_ids: list[int],
    focus_query: str = "methods findings limitations",
) -> dict[str, Any]:
    if not paper_ids:
        return {"executive_summary": "No papers were selected for synthesis.", "key_insights": []}

    papers_meta = db.execute(
        text(
            "SELECT id, title, publication_year AS year, venue, abstract "
            "FROM papers WHERE id = ANY(:ids)"
        ),
        {"ids": paper_ids},
    ).fetchall()
    if not papers_meta:
        return {
            "executive_summary": "None of the selected paper IDs were found.",
            "key_insights": [],
        }

    # Evidence per paper
    evidence_by_paper: dict[int, list[dict[str, Any]]] = {}
    for p in papers_meta:
        evidence_by_paper[p.id] = gather_paper_evidence(db, p.id, focus_query)

    # Build comparative context
    blocks: list[str] = []
    flat_citations: list[dict[str, Any]] = []
    marker = 1
    citation_by_chunk: dict[tuple[int, int], str] = {}
    for p in papers_meta:
        for ev in evidence_by_paper.get(p.id, []):
            content = _clean_evidence(ev.get("content"))
            if len(content) < 40:
                continue
            marker_text = f"[{marker}]"
            blocks.append(
                f"{marker_text} Paper #{p.id}: {p.title} ({p.year or 'n.d.'}); "
                f"section type: {ev['aspect']}\n{content[:900]}"
            )
            flat_citations.append(
                {
                    "marker": marker_text,
                    "paper_id": p.id,
                    "chunk_id": ev["chunk_id"],
                    "title": p.title,
                    "year": p.year,
                    "aspect": ev["aspect"],
                    "score": round(float(ev.get("score", 0)) * 100, 1),
                    "snippet": content[:300],
                }
            )
            citation_by_chunk[(p.id, ev["chunk_id"])] = marker_text
            marker += 1

    meta_lines = [
        f"- Paper #{p.id}: \"{p.title}\" ({p.year or 'n.d.'}, venue: {p.venue or 'unknown'})"
        for p in papers_meta
    ]
    question = """Write a concise, structured comparative literature synthesis.
Use these headings: Overall comparison; Methods; Findings and agreements;
Differences or disagreements; Limitations and gaps; Evidence quality.
Compare papers against each other; do not write a disconnected list of abstracts.
Only make claims supported by the supplied evidence blocks, and cite each
paper-specific factual claim with its exact marker, such as [2]. Never assign
a finding to a paper unless its block supports it. If the selected papers cover
unrelated topics or evidence is sparse, state that and avoid claiming a shared
theme. Distinguish abstract-derived evidence from full-text chunk evidence.
Do not invent limitations, disagreements, or research gaps; say when evidence
does not establish them. Use clean prose and avoid repeating paper metadata."""

    context = "\n".join(meta_lines) + "\n\nEVIDENCE:\n" + "\n\n".join(blocks)
    if not blocks:
        context = "\n".join(meta_lines) + "\n\n(No indexed chunks available — metadata only.)"

    overlap = _topic_overlap(papers_meta)
    synthesis = _generate_llm(question, context) if blocks and overlap >= 0.01 else None
    grounded_by_llm = synthesis is not None

    if synthesis is None:
        synthesis = _deterministic_synthesis(
            papers_meta, evidence_by_paper, flat_citations, citation_by_chunk
        )
        if overlap < 0.01 and len(papers_meta) > 1:
            synthesis = (
                "## Comparability warning\n\n"
                "The selected papers do not show enough shared topic terms for a "
                "reliable combined synthesis. The output below summarizes each "
                "paper separately; select papers focused on the same research "
                "question for a cross-paper comparison.\n\n" + synthesis
            )

    check = validate_citations(synthesis, flat_citations)
    if not check["all_citations_valid"]:
        for m in check["fabricated_citations"]:
            synthesis = synthesis.replace(m, "")
        check["fabricated_citations_removed"] = True

    aspects = {}
    for c in flat_citations:
        aspects.setdefault(c["aspect"], 0)
        aspects[c["aspect"]] += 1

    return {
        "executive_summary": synthesis,
        "key_insights": _key_insights(papers_meta, evidence_by_paper, aspects),
        "citations": flat_citations,
        "citation_check": check,
        "grounded": grounded_by_llm and bool(flat_citations),
        "generation_mode": "llm" if grounded_by_llm else "extractive",
        "topic_overlap": round(overlap, 3),
        "evidence_stats": {
            "papers": len(papers_meta),
            "chunks_used": len(flat_citations),
            "aspects": aspects,
        },
    }


def _deterministic_synthesis(
    papers_meta, evidence_by_paper, citations: list[dict[str, Any]],
    citation_by_chunk: dict[tuple[int, int], str],
) -> str:
    lines = ["## Overall comparison", ""]
    if len(papers_meta) > 1:
        lines.append(
            f"The selected set contains {len(papers_meta)} papers and "
            f"{len(citations)} usable evidence excerpts. The excerpts support "
            "paper-level summaries; use the sections below to compare only where evidence overlaps."
        )
    else:
        lines.append("Only one paper is selected, so cross-paper comparison is not possible.")
    lines.extend(["", "## Evidence by paper", ""])
    for p in papers_meta:
        evs = evidence_by_paper.get(p.id, [])
        lines.append(f"### {p.title} ({p.year or 'year unavailable'})")
        if not evs:
            abstract = _clean_evidence(getattr(p, "abstract", None))
            if abstract:
                lines.append(f"Abstract: {abstract[:500]} (abstract only; no indexed chunks).")
            else:
                lines.append("No abstract or indexed text is available for this paper.")
        else:
            for ev in evs:
                content = _clean_evidence(ev.get("content"))
                marker = citation_by_chunk.get((p.id, ev.get("chunk_id")))
                if content and marker:
                    lines.append(f"- {content[:400]} {marker}")
        lines.append("")
    lines.extend([
        "## Differences, limitations, and gaps", "",
        "The available excerpts do not support a reliable cross-paper claim about "
        "disagreements, limitations, or research gaps. Inspect the cited passages "
        "and add full-text PDFs before drawing those conclusions.",
    ])
    if not citations:
        lines.extend([
            "", "## Evidence quality", "",
            "No indexed chunks were available. This is a metadata/abstract-level "
            "overview, not a full-text evidence-grounded synthesis.",
        ])
    return "\n".join(lines)


def _key_insights(papers_meta, evidence_by_paper, aspects: dict[str, int]) -> list[str]:
    insights: list[str] = []
    years = [p.year for p in papers_meta if p.year]
    if years:
        insights.append(f"Publication span: {min(years)}–{max(years)}")
    if aspects.get("method"):
        insights.append(f"{aspects['method']} method-focused chunk(s) compared")
    if aspects.get("limitation"):
        insights.append(f"{aspects['limitation']} limitation-focused chunk(s) — candidate research gap")
    if aspects.get("finding"):
        insights.append(f"{aspects['finding']} finding-focused chunk(s) compared")
    chunks_total = sum(len(v) for v in evidence_by_paper.values())
    if chunks_total == 0:
        insights.append("No indexed chunks found — ingest PDFs for evidence-grounded synthesis")
    return insights
