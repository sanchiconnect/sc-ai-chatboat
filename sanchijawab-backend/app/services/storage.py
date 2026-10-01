"""Amazon S3 file storage — replaces local disk writes in sources.py /
parsers.py. Uploaded knowledge files are read back from S3 for parsing,
never from local disk.

Untested against a real bucket — AMAZON_ACCESS_KEY_ID/SECRET/BUCKET are
still blank in .env as of this writing. Safe to import; raises only when
actually called without credentials.
"""
from __future__ import annotations

import boto3

from ..config import settings


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.amazon_s3_endpoint,
        region_name=settings.amazon_region,
        aws_access_key_id=settings.amazon_access_key_id,
        aws_secret_access_key=settings.amazon_secret_access_key,
    )


def upload_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    if not settings.amazon_s3_bucket:
        raise RuntimeError("AMAZON_S3_BUCKET is not set — cannot upload")
    _client().put_object(Bucket=settings.amazon_s3_bucket, Key=key, Body=data, ContentType=content_type)
    return key


def download_bytes(key: str) -> bytes:
    if not settings.amazon_s3_bucket:
        raise RuntimeError("AMAZON_S3_BUCKET is not set — cannot download")
    obj = _client().get_object(Bucket=settings.amazon_s3_bucket, Key=key)
    return obj["Body"].read()
