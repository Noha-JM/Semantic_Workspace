FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir 'azure-storage-blob>=12,<13' 'minio>=7,<8'

WORKDIR /backup
COPY backup.py /backup/backup.py
ENTRYPOINT ["python", "/backup/backup.py"]
