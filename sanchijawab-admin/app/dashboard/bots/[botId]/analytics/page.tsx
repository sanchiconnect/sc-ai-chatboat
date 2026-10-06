"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { AddAnswerForm } from "@/components/AddAnswerForm";

type Summary = {
  days: number;
  total_conversations: number;
  total_messages: number;
  handoff_count: number;
  resolution_rate: number | null;
  leads_count: number;
  message_satisfaction_rate: number | null;
  top_questions: { question: string; count: number }[];
};

type Unanswered = { message_id: string; question: string | null; bot_answer: string; created_at: string };
type CrawlSuccess = { days: number; total_jobs: number; by_status: Record<string, number>; success_rate: number | null };

function pct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n * 100)}%`;
}

export default function AnalyticsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [unanswered, setUnanswered] = useState<Unanswered[]>([]);
  const [crawlSuccess, setCrawlSuccess] = useState<CrawlSuccess | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([api.getAnalyticsSummary(botId, days), api.getUnanswered(botId, days), api.getCrawlSuccess(botId, days)])
      .then(([s, u, c]) => {
        setSummary(s);
        setUnanswered(u);
        setCrawlSuccess(c);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [botId, days]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">Analytics</h2>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Date range"
          className="border border-border rounded-lg px-2 py-1 text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {error && <div className="text-sm text-danger bg-danger-soft rounded p-2 mb-4">{error}</div>}
      {loading && <p className="text-sm text-fg-muted">Loading…</p>}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Conversations", value: summary.total_conversations },
              { label: "Messages", value: summary.total_messages },
              { label: "Resolution rate", value: pct(summary.resolution_rate) },
              { label: "Handoffs", value: summary.handoff_count },
              { label: "Leads captured", value: summary.leads_count },
              { label: "Message satisfaction*", value: pct(summary.message_satisfaction_rate) },
              { label: "Crawl success rate", value: crawlSuccess ? pct(crawlSuccess.success_rate) : "—" },
            ].map((card) => (
              <div key={card.label} className="border border-border rounded-lg p-3">
                <p className="text-xs text-fg-muted">{card.label}</p>
                <p className="text-xl font-bold">{card.value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-fg-faint -mt-4 mb-6">
            *From visitor thumbs up/down on individual answers — not a post-chat CSAT survey (not built).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium mb-2">Top questions</h3>
              {summary.top_questions.length === 0 && <p className="text-sm text-fg-muted">No data yet.</p>}
              <ul className="space-y-1">
                {summary.top_questions.map((q, i) => (
                  <li key={i} className="text-sm flex justify-between border-b border-border py-1">
                    <span className="truncate pr-2">{q.question}</span>
                    <span className="text-fg-faint">{q.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-medium mb-2">Unanswered / low-confidence questions</h3>
              {unanswered.length === 0 && <p className="text-sm text-fg-muted">None in this period — nice.</p>}
              <ul className="space-y-3">
                {unanswered.map((u) => (
                  <li key={u.message_id} className="border border-border rounded-lg p-3">
                    <p className="text-sm font-medium">{u.question || "(question not recorded)"}</p>
                    <p className="text-xs text-fg-muted mt-1">{u.bot_answer}</p>
                    <div className="mt-2">
                      <AddAnswerForm question={u.question} onSaved={load} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
