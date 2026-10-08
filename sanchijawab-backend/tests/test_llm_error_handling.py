"""A model reply that is not valid JSON must never break a chat reply (the follow-up chips are optional)."""
from __future__ import annotations

from app.services import llm


class _Resp:
    text = '{"follow_ups": ["a" "b"]}'  # broken JSON, as the model occasionally produces
    usage_metadata = None


class _Models:
    async def generate_content(self, **kwargs):
        return _Resp()


class _Aio:
    models = _Models()


class _Client:
    aio = _Aio()


async def test_broken_json_from_the_model_just_means_no_follow_up_chips(monkeypatch):
    monkeypatch.setattr(llm, "_client", lambda: _Client())
    assert await llm.suggest_follow_ups("how many startups", "60+") == []


async def test_broken_json_in_action_planning_is_not_fatal(monkeypatch):
    monkeypatch.setattr(llm, "_client", lambda: _Client())
    assert await llm.plan_action("book a demo", [], "", []) == {}  # "no action": a normal answer follows
