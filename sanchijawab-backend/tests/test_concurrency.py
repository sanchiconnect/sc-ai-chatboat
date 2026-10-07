"""Regression test for the DB-pool deadlock found by the load test (SAN-1132):
endpoints used to hold one pooled connection while require_workspace_role
asked for a second, so more concurrent requests than the pool size hung for
the 30s pool timeout and then failed."""
from __future__ import annotations

import asyncio

from httpx import AsyncClient


async def test_many_concurrent_authenticated_requests_all_succeed(client: AsyncClient, signed_up_owner: dict, bot: str):
    async def one():
        return (await client.get(f"/v1/bots/{bot}", headers=signed_up_owner["headers"])).status_code

    codes = await asyncio.wait_for(asyncio.gather(*(one() for _ in range(80))), timeout=20)
    assert codes == [200] * 80
