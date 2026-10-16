"""Daily logical backup of PostgreSQL and MinIO to Azure Blob Storage."""
from __future__ import annotations

import os
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from azure.storage.blob import BlobServiceClient
from minio import Minio


def main() -> None:
    connection = os.environ["AZURE_STORAGE_CONNECTION_STRING"]
    container_name = os.getenv("AZURE_STORAGE_CONTAINER", "srw-backups")
    retention_days = int(os.getenv("BACKUP_RETENTION_DAYS", "7"))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    blob_service = BlobServiceClient.from_connection_string(connection)
    container = blob_service.get_container_client(container_name)
    if not container.exists():
        container.create_container()

    with tempfile.TemporaryDirectory(prefix="srw-backup-") as temp_dir:
        dump_path = Path(temp_dir) / "postgres.dump"
        env = os.environ.copy()
        env["PGPASSWORD"] = os.environ["POSTGRES_PASSWORD"]
        subprocess.run(
            [
                "pg_dump",
                "--format=custom",
                "--no-owner",
                "--no-privileges",
                "--file",
                str(dump_path),
                "--host",
                os.getenv("POSTGRES_HOST", "postgres"),
                "--port",
                os.getenv("POSTGRES_PORT", "5432"),
                "--username",
                os.getenv("POSTGRES_USER", "postgres"),
                os.getenv("POSTGRES_DB", "semantic_workspace"),
            ],
            env=env,
            check=True,
        )
        upload_file(container, f"{stamp}/postgres.dump", dump_path)

        minio = Minio(
            f"{os.getenv('MINIO_HOST', 'minio')}:{os.getenv('MINIO_PORT', '9000')}",
            access_key=os.environ["MINIO_ACCESS_KEY"],
            secret_key=os.environ["MINIO_SECRET_KEY"],
            secure=os.getenv("MINIO_SECURE", "false").lower() == "true",
        )
        bucket = os.getenv("MINIO_BUCKET", "papers")
        object_count = 0
        for item in minio.list_objects(bucket, recursive=True):
            response = minio.get_object(bucket, item.object_name)
            try:
                blob = container.get_blob_client(f"{stamp}/minio/{item.object_name}")
                blob.upload_blob(response, length=item.size, overwrite=True)
            finally:
                response.close()
                response.release_conn()
            object_count += 1

    prune_old_backups(container, retention_days)
    print(f"Backup {stamp} complete: PostgreSQL plus {object_count} MinIO objects")


def upload_file(container, blob_name: str, path: Path) -> None:
    with path.open("rb") as file:
        container.get_blob_client(blob_name).upload_blob(file, overwrite=True)


def prune_old_backups(container, retention_days: int) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    stale_prefixes = set()
    for blob in container.list_blobs():
        stamp = blob.name.split("/", 1)[0]
        try:
            created = datetime.strptime(stamp, "%Y%m%dT%H%M%SZ").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            continue
        if created < cutoff:
            stale_prefixes.add(stamp)
    for stamp in stale_prefixes:
        for blob in container.list_blobs(name_starts_with=f"{stamp}/"):
            container.delete_blob(blob.name)


if __name__ == "__main__":
    main()
