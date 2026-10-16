"""RQ worker: runs the PDF ingestion pipeline with retry support."""
from __future__ import annotations

import logging
import os
from urllib.parse import urlsplit

from minio import Minio
from redis import Redis
from rq import Queue, Worker

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger("worker")

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

MINIO_HOST = os.getenv("MINIO_HOST", "minio")
MINIO_PORT = int(os.getenv("MINIO_PORT", "9000"))
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "papers")

MAX_ATTEMPTS = int(os.getenv("INGESTION_MAX_RETRIES", "3"))

redis_connection = Redis(host=REDIS_HOST, port=REDIS_PORT)

# Must exceed the longest job runtime (model cold-start + big-PDF embedding).
JOB_TIMEOUT = 1800

queue = Queue("paper_tasks", connection=redis_connection, default_timeout=JOB_TIMEOUT)

minio_client = Minio(
    f"{MINIO_HOST}:{MINIO_PORT}",
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=os.getenv("MINIO_SECURE", "false").lower() == "true",
)


def _minio_object_exists(obj: str) -> bool:
    from minio.error import S3Error

    try:
        minio_client.stat_object(MINIO_BUCKET, obj)
        return True
    except S3Error:
        return False


def _get_pdf_url(paper_id: int) -> str | None:
    from sqlalchemy import text as sql_text

    from app.db.databases import SessionLocal

    db = SessionLocal()
    try:
        row = db.execute(
            sql_text("SELECT pdf_url FROM papers WHERE id=:pid"), {"pid": paper_id}
        ).fetchone()
        return (row.pdf_url or None) if row else None
    finally:
        db.close()


def _get_openalex_id(paper_id: int) -> str | None:
    from sqlalchemy import text as sql_text

    from app.db.databases import SessionLocal

    db = SessionLocal()
    try:
        row = db.execute(
            sql_text("SELECT openalex_id FROM papers WHERE id=:pid"), {"pid": paper_id}
        ).fetchone()
        return row.openalex_id if row else None
    finally:
        db.close()


def _download_pdf_to_minio(paper_id: int, pdf_url: str) -> str:
    """Download a paper PDF from its public URL and store it in MinIO."""
    import io

    import httpx

    from app.services.pipeline import PipelineError

    obj = f"paper_{paper_id}.pdf"
    parsed_url = urlsplit(pdf_url)
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; SemanticResearchWorkspace/1.0)",
        "Accept": "application/pdf,*/*",
    }
    if parsed_url.hostname == "content.openalex.org":
        from app.core.config import get_settings

        api_key = get_settings().openalex_api_key
        if not api_key:
            raise PipelineError(
                "OpenAlex has a cached PDF, but downloading it requires OPENALEX_API_KEY."
            )
        headers["Authorization"] = f"Bearer {api_key}"

    safe_url = f"{parsed_url.hostname or 'unknown'}{parsed_url.path}"
    logger.info("downloading pdf for paper %s from %s", paper_id, safe_url)
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        resp = client.get(pdf_url, headers=headers)
        resp.raise_for_status()
    content_type = resp.headers.get("content-type", "")
    if "pdf" not in content_type.lower() and not resp.content[:5].startswith(b"%PDF-"):
        raise PipelineError(
            f"source URL did not return a PDF (content-type={content_type or 'unknown'})"
        )
    minio_client.put_object(
        MINIO_BUCKET,
        obj,
        io.BytesIO(resp.content),
        length=len(resp.content),
        content_type="application/pdf",
    )
    logger.info("stored %s bytes for paper %s as %s", len(resp.content), paper_id, obj)
    return obj


def process_paper_job(paper_id: int, object_name: str | None = None) -> dict:
    """Run the full ingestion pipeline for one paper.

    Resolution order for the PDF source:
      1. explicit MinIO object name (PDF upload flow)
      2. existing `paper_{id}.pdf` object in MinIO
      3. the paper's `pdf_url` (live OpenAlex import flow) — downloaded here

    Retries are implemented via re-enqueue with attempts tracked on the paper
    row (ingestion_attempts maintained by the DB trigger).
    """
    from sqlalchemy import text as sql_text

    from app.db.databases import SessionLocal
    from app.services.pipeline import PipelineError, run_ingestion_pipeline

    obj = object_name or f"paper_{paper_id}.pdf"
    db = SessionLocal()
    pipeline_started = False
    try:
        if not _minio_object_exists(obj):
            pdf_url = _get_pdf_url(paper_id)
            candidate_urls = [pdf_url] if pdf_url else []
            openalex_id = _get_openalex_id(paper_id)
            openalex_error = None
            if openalex_id:
                try:
                    from app.services.openalex_api import get_openalex_pdf_urls

                    for candidate in get_openalex_pdf_urls(openalex_id):
                        if candidate not in candidate_urls:
                            candidate_urls.append(candidate)
                except Exception as exc:
                    openalex_error = f"OpenAlex lookup failed: {exc}"
                    logger.warning("OpenAlex PDF lookup failed for paper %s: %s", paper_id, exc)

            if not candidate_urls:
                raise PipelineError(
                    "OpenAlex has no direct open-access PDF listed for this paper. "
                    "Upload a PDF if you have access to one."
                    if openalex_id
                    else f"no PDF available for paper {paper_id} (no object, no pdf_url)"
                )

            download_errors = []
            for candidate in candidate_urls:
                try:
                    obj = _download_pdf_to_minio(paper_id, candidate)
                    break
                except Exception as exc:
                    parsed_candidate = urlsplit(candidate)
                    source = f"{parsed_candidate.hostname or 'unknown'}{parsed_candidate.path}"
                    download_errors.append(f"{source}: {exc}")
            else:
                details = "; ".join(download_errors[-3:])
                if openalex_error:
                    details = f"{details}; {openalex_error}" if details else openalex_error
                raise PipelineError(
                    "Could not fetch a PDF from the paper's OpenAlex locations. "
                    f"Tried {len(candidate_urls)} URL(s). {details}"[:500]
                )

        logger.info("processing paper %s from %s/%s", paper_id, MINIO_BUCKET, obj)

        local_path = f"/tmp/{paper_id}_{os.path.basename(obj)}"
        minio_client.fget_object(MINIO_BUCKET, obj, local_path)

        with open(local_path, "rb") as fh:
            pdf_bytes = fh.read()

        pipeline_started = True
        result = run_ingestion_pipeline(db, paper_id, pdf_bytes)
        logger.info("paper %s ingested: %s", paper_id, result)
        return result
    except Exception as exc:
        # Failures before run_ingestion_pipeline (e.g. a URL returning an HTML
        # landing page instead of a PDF) must also leave a visible terminal
        # status. The pipeline records its own errors; this covers download and
        # MinIO retrieval failures that happen before it marks the row running.
        db.rollback()
        message = str(exc)[:500] or exc.__class__.__name__
        db.execute(
            sql_text(
                "UPDATE papers SET ingestion_status='failed', ingestion_error=:err "
                "WHERE id=:pid AND ingestion_status <> 'success'"
            ),
            {"err": message, "pid": paper_id},
        )
        db.commit()
        logger.error("paper %s failed: %s", paper_id, message)
        if pipeline_started and isinstance(exc, PipelineError):
            _maybe_requeue(paper_id, obj)
        raise
    finally:
        db.close()


def _maybe_requeue(paper_id: int, obj: str) -> None:
    """Re-enqueue on the queue if attempts remain.

    Retries go straight back onto the queue rather than into RQ's scheduled
    registry: the pipeline is idempotent (it atomically replaces previous
    chunks) and most failures are deterministic, so a backoff delay only adds
    a failure mode where scheduled jobs are never promoted.
    """
    from sqlalchemy import text as sql_text

    from app.db.databases import SessionLocal

    db = SessionLocal()
    try:
        row = db.execute(
            sql_text("SELECT ingestion_attempts FROM papers WHERE id=:pid"),
            {"pid": paper_id},
        ).fetchone()
        attempts = row.ingestion_attempts if row else 0
        if attempts < MAX_ATTEMPTS:
            queue.enqueue(
                "app.worker.worker.process_paper_job",
                paper_id,
                obj,
                timeout=JOB_TIMEOUT,
            )
            logger.info("requeued paper %s (attempt %s)", paper_id, attempts + 1)
    finally:
        db.close()


def ensure_bucket() -> None:
    if not minio_client.bucket_exists(MINIO_BUCKET):
        minio_client.make_bucket(MINIO_BUCKET)
        logger.info("created bucket %s", MINIO_BUCKET)


if __name__ == "__main__":
    ensure_bucket()
    logger.info("worker listening on queue paper_tasks")
    worker = Worker([queue], connection=redis_connection)
    worker.work()
