"""One-off: verify Qdrant Cloud and S3 credentials actually work — a real
collection round-trip and a real object upload/download, not just an
auth handshake.
"""
from __future__ import annotations

import asyncio

from ..config import settings
from ..services import storage, vector_store


async def check_qdrant():
    try:
        await vector_store.ensure_collection()
        client = vector_store.get_client()
        info = await client.get_collection(vector_store.COLLECTION)
        print(f"[qdrant] OK — collection {vector_store.COLLECTION!r}: {info.points_count} points, "
              f"status={info.status}")
    except Exception as e:
        print(f"[qdrant] FAILED — {type(e).__name__}: {e}")


def check_s3():
    try:
        key = "sanchijawab/_healthcheck.txt"
        storage.upload_bytes(key, b"sanchijawab s3 healthcheck", "text/plain")
        data = storage.download_bytes(key)
        assert data == b"sanchijawab s3 healthcheck"
        print(f"[s3] OK — uploaded+downloaded {key!r} from bucket {settings.amazon_s3_bucket!r}")
    except Exception as e:
        print(f"[s3] FAILED — {type(e).__name__}: {e}")


async def main():
    await check_qdrant()
    check_s3()


if __name__ == "__main__":
    asyncio.run(main())
