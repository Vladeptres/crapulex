#!/usr/bin/env python3
"""
Crapulex Backup Script
======================
Creates a full backup of:
  - All MongoDB collections from the production database
  - All objects from the production MinIO bucket

Scheduling behaviour (anacron-style):
  - Intended to run every Tuesday at 12:00 via systemd timer.
  - On each invocation it checks a timestamp file to see when the last
    successful backup was made.  If more than 6 days have elapsed (i.e. the
    Tuesday run was missed), a backup is performed immediately.
  - Only the last MAX_BACKUPS (4) successful backups are kept on disk.

Backup layout:
  backups/
    2025-02-18T12-00-00/
      mongo/                  # One JSON file per collection
        conversations.json
        messages.json
        users.json
      minio/                  # Mirror of every object in the bucket
        <conversation_id>/<media_id>.<ext>
      manifest.json           # Metadata about the backup
    ...
    .last_backup              # Timestamp of last successful backup
"""

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

from bson import json_util
from dotenv import load_dotenv
from pymongo import MongoClient

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ENV_FILE = BACKEND_DIR / ".env.prod"

load_dotenv(ENV_FILE)

MONGO_ROOT_USERNAME = os.environ.get("MONGO_ROOT_USERNAME", "prod_user")
MONGO_ROOT_PASSWORD = os.environ.get("MONGO_ROOT_PASSWORD", "")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "crapulex_prod")
MONGO_DB_HOST = os.environ.get("MONGO_DB_HOST", "localhost")
MONGO_DB_PORT = os.environ.get("MONGO_DB_PORT", "27017")

MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://localhost:9000")
MINIO_ROOT_USER = os.environ.get("MINIO_ROOT_USER", "minioadmin")
MINIO_ROOT_PASSWORD = os.environ.get("MINIO_ROOT_PASSWORD", "minioadmin")

# Derive bucket name the same way MediasStore does
MEDIA_STORAGE_URI = os.environ.get("MEDIA_STORAGE_URI", "media_files")
if MEDIA_STORAGE_URI.startswith("s3://"):
    MINIO_BUCKET = MEDIA_STORAGE_URI[len("s3://"):]
else:
    _last = MEDIA_STORAGE_URI.strip("/").split("/")[-1] if "/" in MEDIA_STORAGE_URI.strip("/") else MEDIA_STORAGE_URI.strip("/")
    MINIO_BUCKET = _last.replace("_", "-").lower() or "media-files"

BACKUPS_DIR = Path(os.environ.get("BACKUPS_DIR", "/home/julien-gaste/crapulex/backups/"))
LAST_BACKUP_FILE = BACKUPS_DIR / ".last_backup"
MAX_BACKUPS = 4
BACKUP_INTERVAL_DAYS = 7  # Expected interval between backups


def log(msg: str) -> None:
    print(f"[backup] {datetime.now().isoformat()} — {msg}", flush=True)


# ---------------------------------------------------------------------------
# Anacron-style check
# ---------------------------------------------------------------------------

def should_run_backup(force: bool = False) -> bool:
    """Return True if a backup should be performed now."""
    if force:
        log("Forced backup requested.")
        return True

    if not LAST_BACKUP_FILE.exists():
        log("No previous backup found — running first backup.")
        return True

    last_ts = datetime.fromisoformat(LAST_BACKUP_FILE.read_text().strip())
    elapsed = datetime.now() - last_ts
    if elapsed >= timedelta(days=BACKUP_INTERVAL_DAYS):
        log(f"Last backup was {elapsed.days} days ago (threshold={BACKUP_INTERVAL_DAYS}d) — backup needed.")
        return True

    log(f"Last backup was {elapsed.days}d {elapsed.seconds // 3600}h ago — skipping.")
    return False


# ---------------------------------------------------------------------------
# MongoDB backup
# ---------------------------------------------------------------------------

def backup_mongodb(dest: Path) -> int:
    """Dump every collection in the database to JSON files. Returns doc count."""
    dest.mkdir(parents=True, exist_ok=True)
    mongo_url = (
        f"mongodb://{MONGO_ROOT_USERNAME}:{MONGO_ROOT_PASSWORD}"
        f"@{MONGO_DB_HOST}:{MONGO_DB_PORT}/{MONGO_DB_NAME}?authSource=admin"
    )
    client = MongoClient(mongo_url, serverSelectionTimeoutMS=10_000)
    db = client[MONGO_DB_NAME]

    total_docs = 0
    for collection_name in db.list_collection_names():
        docs = list(db[collection_name].find())
        out_file = dest / f"{collection_name}.json"
        out_file.write_text(json_util.dumps(docs, indent=2))
        total_docs += len(docs)
        log(f"  MongoDB: {collection_name} → {len(docs)} documents")

    client.close()
    return total_docs


# ---------------------------------------------------------------------------
# MinIO backup  (uses mc CLI if available, falls back to boto3)
# ---------------------------------------------------------------------------

def _mc_available() -> bool:
    """Check if the MinIO client (mc) CLI is on PATH."""
    return shutil.which("mc") is not None


def backup_minio_mc(dest: Path) -> int:
    """Use `mc` CLI to mirror the bucket."""
    dest.mkdir(parents=True, exist_ok=True)
    alias = "crapulex_backup"
    subprocess.run(
        ["mc", "alias", "set", alias, MINIO_ENDPOINT, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD],
        check=True, capture_output=True,
    )
    result = subprocess.run(
        ["mc", "mirror", "--overwrite", f"{alias}/{MINIO_BUCKET}", str(dest)],
        check=True, capture_output=True, text=True,
    )
    log(f"  MinIO (mc): mirror complete — {result.stdout.strip()}")
    # Count files
    count = sum(1 for _ in dest.rglob("*") if _.is_file())
    return count


def backup_minio_boto3(dest: Path) -> int:
    """Fallback: use boto3 to download every object."""
    import boto3

    dest.mkdir(parents=True, exist_ok=True)
    s3 = boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ROOT_USER,
        aws_secret_access_key=MINIO_ROOT_PASSWORD,
        region_name="us-east-1",
    )

    count = 0
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=MINIO_BUCKET):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            target = dest / key
            target.parent.mkdir(parents=True, exist_ok=True)
            s3.download_file(MINIO_BUCKET, key, str(target))
            count += 1

    log(f"  MinIO (boto3): downloaded {count} objects")
    return count


def backup_minio(dest: Path) -> int:
    if _mc_available():
        return backup_minio_mc(dest)
    return backup_minio_boto3(dest)


# ---------------------------------------------------------------------------
# Retention policy
# ---------------------------------------------------------------------------

def enforce_retention() -> None:
    """Keep only the last MAX_BACKUPS successful backups."""
    if not BACKUPS_DIR.exists():
        return

    # Each backup is a directory with a manifest.json
    backups = sorted(
        [d for d in BACKUPS_DIR.iterdir() if d.is_dir() and (d / "manifest.json").exists()],
        key=lambda d: d.name,
        reverse=True,
    )

    to_delete = backups[MAX_BACKUPS:]
    for old in to_delete:
        log(f"Retention: removing old backup {old.name}")
        shutil.rmtree(old)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run_backup(force: bool = False) -> bool:
    """Execute a full backup. Returns True on success."""
    if not should_run_backup(force):
        return False

    timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    backup_dir = BACKUPS_DIR / timestamp
    backup_dir.mkdir(parents=True, exist_ok=True)

    log(f"Starting backup → {backup_dir}")

    try:
        mongo_docs = backup_mongodb(backup_dir / "mongo")
    except Exception as exc:
        log(f"ERROR during MongoDB backup: {exc}")
        shutil.rmtree(backup_dir, ignore_errors=True)
        return False

    try:
        minio_objects = backup_minio(backup_dir / "minio")
    except Exception as exc:
        log(f"ERROR during MinIO backup: {exc}")
        shutil.rmtree(backup_dir, ignore_errors=True)
        return False

    # Write manifest
    manifest = {
        "timestamp": timestamp,
        "mongo_db": MONGO_DB_NAME,
        "mongo_docs_total": mongo_docs,
        "minio_bucket": MINIO_BUCKET,
        "minio_objects_total": minio_objects,
        "env_file": str(ENV_FILE),
    }
    (backup_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    # Update last-backup timestamp
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    LAST_BACKUP_FILE.write_text(datetime.now().isoformat())

    log(f"Backup complete: {mongo_docs} Mongo docs, {minio_objects} MinIO objects.")

    enforce_retention()
    return True


if __name__ == "__main__":
    force = "--force" in sys.argv
    success = run_backup(force=force)
    sys.exit(0 if success else 1)
