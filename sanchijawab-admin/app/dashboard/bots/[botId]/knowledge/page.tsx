"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

interface SourceRow {
  source_id: string;
  url: string;
  visibility: string;
  job_status: string | null;
  job_error: string | null;
}

const ACCEPTED_FILE_TYPES = ".pdf,.docx,.pptx,.txt,.md,.csv,.tsv,.xlsx";

export default function KnowledgePage() {
  const { botId } = useParams<{ botId: string }>();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setSources(await api.listSources(botId));
  }

  useEffect(() => {
    refresh();
    // Poll while anything is still pending/queued/running, so status
    // updates (e.g. "queued" -> "done") show up without a manual refresh.
    const interval = setInterval(() => {
      refresh().catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await api.createSource(botId, url.trim());
      setUrl("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add source");
    } finally {
      setAdding(false);
    }
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.createFileSource(botId, file);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeSource(sourceId: string) {
    if (!window.confirm("Remove this source? The bot will stop using it to answer questions.")) return;
    setDeletingId(sourceId);
    setError(null);
    try {
      await api.deleteSource(sourceId);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove source");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-bold mb-4">Knowledge sources</h2>

      <form onSubmit={addSource} className="bg-surface border border-border rounded-lg p-4 flex gap-2 mb-3">
        <input
          className="flex-1 border border-border rounded-lg px-3 py-2"
          placeholder="https://example.com/"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={adding}
          className="bg-accent text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50"
        >
          {adding ? "Adding…" : "+ Website"}
        </button>
      </form>

      <div className="bg-surface border border-border rounded-lg p-4 flex items-center gap-3 mb-6">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={onFilePicked}
          disabled={uploading}
          className="flex-1 text-sm"
        />
        <span className="text-xs text-fg-faint whitespace-nowrap">PDF, DOCX, PPTX, TXT, MD, CSV, TSV, XLSX — max 50MB</span>
        {uploading && <span className="text-sm text-accent-ink">Uploading…</span>}
      </div>

      {error && <div className="text-sm text-danger bg-danger-soft rounded p-2 mb-4">{error}</div>}

      <div className="space-y-2">
        {sources.length === 0 && <p className="text-fg-faint text-sm">No sources yet.</p>}
        {sources.map((s) => (
          <div key={s.source_id} className="bg-surface border border-border rounded-lg px-4 py-3 flex justify-between items-center gap-3">
            <span className="text-sm min-w-0 break-all">{s.url}</span>
            <span className="shrink-0 flex items-center gap-2">
              <StatusBadge status={s.job_status} error={s.job_error} />
              <button
                onClick={() => removeSource(s.source_id)}
                disabled={deletingId === s.source_id}
                aria-label={`Remove ${s.url}`}
                title="Remove source"
                className="text-fg-faint hover:text-danger disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
                </svg>
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status, error }: { status: string | null; error: string | null }) {
  const styles: Record<string, string> = {
    queued: "bg-surface-2 text-fg-muted",
    running: "bg-accent-soft text-accent-ink",
    done: "bg-success-soft text-success",
    failed: "bg-danger-soft text-danger",
  };
  const label = status ?? "unknown";
  return (
    <span title={error ?? undefined} className={`text-xs px-2 py-1 rounded-full ${styles[label] ?? ""}`}>
      {label}
    </span>
  );
}
