"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { AddAnswerForm } from "@/components/AddAnswerForm";

type ConversationSummary = {
  conversation_id: string;
  status: string;
  visitor_id: string;
  page_url: string;
  started_at: string;
  last_message: string | null;
  team: string | null;
};

type ConversationDetail = {
  conversation_id: string;
  status: string;
  visitor_id: string;
  page_url: string;
  started_at: string;
  team: string | null;
  messages: { id: string; role: string; content: string; created_at: string }[];
  leads: { name: string; email: string; phone: string }[];
};

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "waiting", label: "Waiting" },
  { value: "human", label: "Human" },
  { value: "bot", label: "Bot" },
  { value: "closed", label: "Closed" },
];

const ROLE_LABEL: Record<string, string> = { visitor: "Visitor", bot: "Bot", agent: "Agent", system: "System" };

/** The visitor message immediately before a given bot message — same
 * "preceding question" logic the Analytics unanswered-questions report
 * uses server-side, just computed client-side here since we already have
 * the whole transcript loaded. */
function precedingQuestion(messages: ConversationDetail["messages"], index: number): string | null {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === "visitor") return messages[i].content;
  }
  return null;
}

export default function InboxPage() {
  const { botId } = useParams<{ botId: string }>();
  const [status, setStatus] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [reply, setReply] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadList() {
    setLoading(true);
    api
      .listConversations(botId, status || undefined)
      .then(setConversations)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load conversations"))
      .finally(() => setLoading(false));
  }

  useEffect(loadList, [botId, status]);

  function loadDetail(id: string) {
    setSelectedId(id);
    api
      .getConversation(id)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load conversation"));
  }

  async function suggest() {
    if (!selectedId) return;
    setSuggesting(true);
    setError(null);
    try {
      const res = await api.suggestReply(selectedId);
      setReply(res.suggestion);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't draft a reply");
    } finally {
      setSuggesting(false);
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    try {
      await api.replyConversation(selectedId, reply.trim());
      setReply("");
      loadDetail(selectedId);
      loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  async function close() {
    if (!selectedId) return;
    await api.closeConversation(selectedId);
    loadDetail(selectedId);
    loadList();
  }

  return (
    <div>
      <h2 className="text-lg font-bold mb-1">Inbox</h2>
      <p className="text-sm text-fg-muted mb-4">
        Conversations the bot flagged for a human, or that a visitor explicitly asked to talk to someone about.
        Replies are picked up by the widget within a few seconds (polling, not realtime).
      </p>

      {error && <div className="text-sm text-danger bg-danger-soft rounded p-2 mb-4">{error}</div>}

      <div className="flex gap-2 mb-4">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={`px-3 py-1 text-sm rounded-full border ${
              status === t.value ? "bg-accent text-white border-accent" : "text-fg-muted border-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 border border-border rounded-lg divide-y divide-border max-h-[32rem] overflow-y-auto">
          {loading && <p className="text-sm text-fg-muted p-3">Loading…</p>}
          {!loading && conversations.length === 0 && <p className="text-sm text-fg-muted p-3">No conversations yet.</p>}
          {conversations.map((c) => (
            <button
              key={c.conversation_id}
              onClick={() => loadDetail(c.conversation_id)}
              className={`w-full text-left p-3 hover:bg-surface-2 ${selectedId === c.conversation_id ? "bg-accent-soft" : ""}`}
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium uppercase text-fg-muted">{c.status}</span>
                <span className="text-xs text-fg-faint">{new Date(c.started_at).toLocaleString()}</span>
              </div>
              <p className="text-sm truncate mt-1">{c.last_message || "(no messages)"}</p>
              {c.team && (
                <span className="inline-block mt-1 text-[11px] font-medium bg-accent-soft text-accent-ink rounded-full px-2 py-0.5">
                  {c.team}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="md:col-span-2 border border-border rounded-lg p-4">
          {!detail && <p className="text-sm text-fg-muted">Select a conversation to view the transcript.</p>}
          {detail && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <div>
                  <span className="text-xs font-medium uppercase text-fg-muted">{detail.status}</span>
                  {detail.team && (
                    <span className="ml-2 text-[11px] font-medium bg-accent-soft text-accent-ink rounded-full px-2 py-0.5">
                      {detail.team}
                    </span>
                  )}
                  <p className="text-xs text-fg-faint truncate max-w-xs">{detail.page_url}</p>
                </div>
                {detail.status !== "closed" && (
                  <button onClick={close} className="text-xs border border-border rounded-full px-3 py-1 text-fg-muted">
                    Close conversation
                  </button>
                )}
              </div>

              {detail.leads.length > 0 && (
                <div className="text-xs bg-success-soft border border-success rounded p-2 mb-3">
                  <span className="font-medium">Lead captured:</span>{" "}
                  {detail.leads.map((l, i) => (
                    <span key={i}>
                      {l.name || "(no name)"} — {l.email || "no email"} {l.phone && `— ${l.phone}`}
                    </span>
                  ))}
                </div>
              )}

              <div className="space-y-3 max-h-80 overflow-y-auto mb-3">
                {detail.messages.map((m, i) => (
                  <div key={m.id} className={m.role === "visitor" ? "text-right" : ""}>
                    <span className="text-xs text-fg-faint">{ROLE_LABEL[m.role] || m.role}</span>
                    <div
                      className={`inline-block rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                        m.role === "visitor" ? "bg-accent text-white" : "bg-surface-2"
                      }`}
                    >
                      {m.content}
                    </div>
                    {m.role === "bot" && (
                      <div>
                        {/* FR-R3 — correct a wrong-but-answered reply right from the
                            transcript; saves as real retrievable knowledge via the
                            same qa_pairs pipeline the Analytics report uses, not
                            just a note on this one conversation. */}
                        <AddAnswerForm
                          question={precedingQuestion(detail.messages, i)}
                          initialAnswer={m.content}
                          label="Correct this answer"
                          savedLabel="Correction saved to knowledge base"
                          onSaved={() => {}}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {detail.status !== "closed" && (
                <form onSubmit={sendReply} className="flex gap-2">
                  <button
                    type="button"
                    onClick={suggest}
                    disabled={suggesting}
                    title="Draft a reply from your knowledge base — you can edit it before sending"
                    className="border border-border rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                  >
                    {suggesting ? "Drafting…" : "✨ Suggest reply"}
                  </button>
                  <input
                    aria-label="Reply as agent"
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-sm"
                    placeholder="Reply as agent…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={sending}
                    className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
