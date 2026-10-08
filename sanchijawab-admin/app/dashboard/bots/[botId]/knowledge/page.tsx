"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

interface SourceRow {
  source_id: string;
  url: string;
  type: string;
  visibility: string;
  job_status: string | null;
  job_error: string | null;
  pages_done: number | null;
  pages_total: number | null;
  rescan_interval_days: number;
  next_scan_at: string | null;
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
  const [rescanningId, setRescanningId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mode, setMode] = useState<"whole_domain" | "single_page" | "sitemap">("whole_domain");
  const [includePatterns, setIncludePatterns] = useState("");
  const [excludePatterns, setExcludePatterns] = useState("");
  const [maxPages, setMaxPages] = useState(5000); // every page by default
  const [rescanIntervalDays, setRescanIntervalDays] = useState(7);
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);

  async function refresh() {
    setSources(await api.listSources(botId));
  }

  useEffect(() => {
    refresh();
    // Poll while anything is still pending/queued/running, so status and
    // live page-progress updates show up without a manual refresh.
    const interval = setInterval(() => {
      refresh().catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    if (!ownershipConfirmed) {
      setError("Please confirm you own this site or have permission to crawl it before adding it.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await api.createSource(botId, url.trim(), "customer", {
        mode,
        includePatterns: includePatterns.trim(),
        excludePatterns: excludePatterns.trim(),
        maxPages,
        ownershipConfirmed,
        rescanIntervalDays,
      });
      setUrl("");
      setOwnershipConfirmed(false);
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

  async function rescanSource(sourceId: string) {
    setRescanningId(sourceId);
    setError(null);
    try {
      await api.rescanSource(sourceId);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start re-scan");
    } finally {
      setRescanningId(null);
    }
  }

  async function stopSource(sourceId: string) {
    setStoppingId(sourceId);
    setError(null);
    try {
      await api.stopSource(sourceId);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to stop crawl");
    } finally {
      setStoppingId(null);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-bold mb-4">Knowledge sources</h2>

      <form onSubmit={addSource} className="bg-surface border border-border rounded-lg p-4 mb-3">
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 border border-border rounded-lg px-3 py-2"
            placeholder="https://example.com/"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={adding}
            className="bg-accent text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50 shrink-0"
          >
            {adding ? "Adding…" : "+ Website"}
          </button>
        </div>

        <label className="mt-2 flex items-start gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={ownershipConfirmed}
            onChange={(e) => setOwnershipConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          I own this site, or have permission to crawl and index it.
        </label>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-2 text-xs text-fg-muted hover:text-fg underline"
        >
          {showAdvanced ? "Hide advanced options" : "Advanced: crawl mode, include/exclude, page limit"}
        </button>

        {showAdvanced && (
          <div className="mt-3 pt-3 border-t border-border grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-fg-muted">
              Crawl mode
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
                className="mt-1 w-full border border-border rounded-lg px-2 py-1.5 bg-surface text-fg text-sm"
              >
                <option value="whole_domain">Whole domain — follow internal links</option>
                <option value="sitemap">Sitemap — read sitemap.xml</option>
                <option value="single_page">Single page — just this URL</option>
              </select>
            </label>

            <label className="text-xs text-fg-muted">
              How many pages to read
              <select
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                disabled={mode === "single_page"}
                className="mt-1 w-full border border-border rounded-lg px-2 py-1.5 text-sm disabled:opacity-50"
              >
                <option value={5000}>Every page (up to 5,000)</option>
                <option value={1000}>Up to 1,000 pages</option>
                <option value={500}>Up to 500 pages</option>
                <option value={250}>Up to 250 pages</option>
                <option value={100}>Up to 100 pages</option>
                <option value={40}>Up to 40 pages</option>
              </select>
            </label>

            <label className="text-xs text-fg-muted">
              Re-scan every <span className="text-fg-faint">(5-365 days)</span>
              <input
                type="number"
                min={5}
                max={365}
                value={rescanIntervalDays}
                onChange={(e) => setRescanIntervalDays(Math.max(5, Math.min(365, Number(e.target.value) || 5)))}
                className="mt-1 w-full border border-border rounded-lg px-2 py-1.5"
              />
            </label>

            <label className="text-xs text-fg-muted sm:col-span-2">
              Include patterns <span className="text-fg-faint">(glob, comma/newline-separated — e.g. */blog/*, */docs/*)</span>
              <input
                value={includePatterns}
                onChange={(e) => setIncludePatterns(e.target.value)}
                disabled={mode === "single_page"}
                placeholder="leave blank to include everything"
                className="mt-1 w-full border border-border rounded-lg px-2 py-1.5 disabled:opacity-50"
              />
            </label>

            <label className="text-xs text-fg-muted sm:col-span-2">
              Exclude patterns <span className="text-fg-faint">(glob — e.g. */cart/*, */login*)</span>
              <input
                value={excludePatterns}
                onChange={(e) => setExcludePatterns(e.target.value)}
                disabled={mode === "single_page"}
                placeholder="leave blank to exclude nothing extra"
                className="mt-1 w-full border border-border rounded-lg px-2 py-1.5 disabled:opacity-50"
              />
            </label>
          </div>
        )}
      </form>

      <div className="bg-surface border border-border rounded-lg p-4 flex flex-wrap items-center gap-3 mb-6">
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Upload a knowledge file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={onFilePicked}
          disabled={uploading}
          className="min-w-0 max-w-full flex-1 text-sm"
        />
        <span className="text-xs text-fg-faint">PDF, DOCX, PPTX, TXT, MD, CSV, TSV, XLSX — max 50MB</span>
        {uploading && <span className="text-sm text-accent-ink">Uploading…</span>}
      </div>

      {error && <div className="text-sm text-danger bg-danger-soft rounded p-2 mb-4">{error}</div>}

      <div className="space-y-2">
        {sources.length === 0 && <p className="text-fg-faint text-sm">No sources yet.</p>}
        {sources.map((s) => {
          const busy = s.job_status === "queued" || s.job_status === "running";
          return (
            <div key={s.source_id} className="bg-surface border border-border rounded-lg px-4 py-3">
              <div className="flex justify-between items-center gap-3">
                <button
                  onClick={() => setExpandedId(expandedId === s.source_id ? null : s.source_id)}
                  className="text-sm min-w-0 break-all text-left hover:underline"
                >
                  {s.url}
                </button>
                <span className="shrink-0 flex items-center gap-2">
                  <StatusBadge status={s.job_status} error={s.job_error} pagesDone={s.pages_done} pagesTotal={s.pages_total} />
                  {s.type === "website" && busy && (
                    <button
                      onClick={() => stopSource(s.source_id)}
                      disabled={stoppingId === s.source_id}
                      title="Stop this crawl"
                      className="text-fg-faint hover:text-danger disabled:opacity-50"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="6" y="6" width="12" height="12" rx="1" />
                      </svg>
                    </button>
                  )}
                  {s.type === "website" && !busy && (
                    <button
                      onClick={() => rescanSource(s.source_id)}
                      disabled={rescanningId === s.source_id}
                      title="Re-scan this source"
                      className="text-fg-faint hover:text-accent-ink disabled:opacity-50"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 2v6h-6M3 22v-6h6M3.5 9a9 9 0 0 1 15-4L21 8M20.5 15a9 9 0 0 1-15 4L3 16" />
                      </svg>
                    </button>
                  )}
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
              {s.type === "website" && !busy && s.next_scan_at && (
                <p className="mt-1 text-[11px] text-fg-faint">
                  Next automatic re-scan: {new Date(s.next_scan_at).toLocaleDateString()} (every {s.rescan_interval_days}{" "}
                  days)
                </p>
              )}
              {expandedId === s.source_id && <SourceDocuments sourceId={s.source_id} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  error,
  pagesDone,
  pagesTotal,
}: {
  status: string | null;
  error: string | null;
  pagesDone: number | null;
  pagesTotal: number | null;
}) {
  const styles: Record<string, string> = {
    queued: "bg-surface-2 text-fg-muted",
    running: "bg-accent-soft text-accent-ink",
    done: "bg-success-soft text-success",
    failed: "bg-danger-soft text-danger",
  };
  const label = status ?? "unknown";
  const showProgress = status === "running" && pagesTotal !== null;
  return (
    <span title={error ?? undefined} className={`text-xs px-2 py-1 rounded-full ${styles[label] ?? ""}`}>
      {showProgress ? `${pagesDone ?? 0} / ${pagesTotal} pages` : label}
    </span>
  );
}

interface DocumentRow {
  document_id: string;
  url: string;
  title: string;
  status: string;
  disabled: boolean;
  error: string | null;
  last_crawled_at: string | null;
}

function SourceDocuments({ sourceId }: { sourceId: string }) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      setDocs(await api.listDocuments(sourceId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load pages");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  async function openView(documentId: string) {
    if (viewingId === documentId) {
      setViewingId(null);
      return;
    }
    setError(null);
    try {
      const doc = await api.getDocument(documentId);
      setContent(doc.content);
      setViewingId(documentId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load page content");
    }
  }

  async function saveEdit(documentId: string) {
    setBusyId(documentId);
    setError(null);
    try {
      await api.editDocument(documentId, content);
      setViewingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save edit");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleDisabled(doc: DocumentRow) {
    setBusyId(doc.document_id);
    setError(null);
    try {
      if (doc.disabled) await api.enableDocument(doc.document_id);
      else await api.disableDocument(doc.document_id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update page");
    } finally {
      setBusyId(null);
    }
  }

  async function removeDoc(documentId: string) {
    if (!window.confirm("Remove this page? The bot will stop using it to answer questions.")) return;
    setBusyId(documentId);
    setError(null);
    try {
      await api.deleteDocument(documentId);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove page");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      {error && <div className="text-xs text-danger bg-danger-soft rounded p-2">{error}</div>}
      {docs === null && <p className="text-xs text-fg-faint">Loading pages…</p>}
      {docs?.length === 0 && <p className="text-xs text-fg-faint">No pages indexed yet.</p>}
      {docs?.map((d) => (
        <div key={d.document_id} className="text-xs">
          <div className="flex items-center gap-2 justify-between">
            <button onClick={() => openView(d.document_id)} className="min-w-0 break-all text-left hover:underline">
              {d.title || d.url}
            </button>
            <span className="shrink-0 flex items-center gap-2">
              {d.disabled && <span className="px-1.5 py-0.5 rounded-full bg-surface-2 text-fg-muted">disabled</span>}
              {d.status === "failed" && (
                <span title={d.error ?? undefined} className="px-1.5 py-0.5 rounded-full bg-danger-soft text-danger">
                  failed
                </span>
              )}
              <button
                onClick={() => toggleDisabled(d)}
                disabled={busyId === d.document_id}
                className="text-fg-faint hover:text-fg disabled:opacity-50"
              >
                {d.disabled ? "Enable" : "Disable"}
              </button>
              <button
                onClick={() => removeDoc(d.document_id)}
                disabled={busyId === d.document_id}
                className="text-fg-faint hover:text-danger disabled:opacity-50"
              >
                Delete
              </button>
            </span>
          </div>
          {viewingId === d.document_id && (
            <div className="mt-2">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                className="w-full border border-border rounded-lg px-2 py-1.5 text-xs font-mono"
                placeholder={content ? undefined : "No stored content — re-scan the source to populate it."}
              />
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => saveEdit(d.document_id)}
                  disabled={busyId === d.document_id}
                  className="bg-accent text-white rounded px-3 py-1 font-medium disabled:opacity-50"
                >
                  {busyId === d.document_id ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setViewingId(null)} className="text-fg-muted">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
