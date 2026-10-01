"""One-off connectivity check against the real MySQL server — read-only,
no schema changes. Deletes itself from the task list once confirmed;
kept under app/poc since it's a diagnostic script, not app code.
"""
from __future__ import annotations

import asyncio
import os

import aiomysql


async def check(host, port, user, password, db, label):
    try:
        conn = await aiomysql.connect(host=host, port=int(port), user=user, password=password, db=db)
        async with conn.cursor() as cur:
            await cur.execute("SELECT VERSION()")
            (version,) = await cur.fetchone()
            await cur.execute("SHOW TABLES")
            tables = [r[0] for r in await cur.fetchall()]
        conn.close()
        print(f"[{label}] OK — MySQL {version}, db={db!r}, {len(tables)} existing tables: {tables}")
    except Exception as e:
        print(f"[{label}] FAILED — {type(e).__name__}: {e}")


async def main():
    await check(
        os.environ["DB_HOST"], os.environ["DB_PORT"], os.environ["DB_USER"],
        os.environ["DB_PASS"], os.environ["DB_NAME"], "app db (sc_sanchi_jawab)",
    )


if __name__ == "__main__":
    asyncio.run(main())
