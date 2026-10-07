"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { staffApi, StaffApiError, StaffContentItem } from "@/lib/staff-api";

const LEGAL_SLUGS = [
  { slug: "privacy", title: "Privacy Policy" },
  { slug: "terms", title: "Terms of Service" },
  { slug: "cookies", title: "Cookie Policy" },
  { slug: "dpa", title: "Data Processing Addendum" },
  { slug: "security", title: "Security" },
];

const EMPTY = { kind: "blog", slug: "", title: "", excerpt: "", body: "", read_minutes: 3, published: false, date: "" };
type Draft = typeof EMPTY;

export default function ContentPage() {
  const [items, setItems] = useState<StaffContentItem[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      setItems(await staffApi.listContent());
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Failed to load content");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function edit(item: StaffContentItem) {
    setIsNew(false);
    setNotice(null);
    setDraft({ ...item, date: item.date || "" });
  }

  function startLegal(slug: string, title: string) {
    const existing = items.find((i) => i.kind === "legal" && i.slug === slug);
    if (existing) return edit(existing);
    setIsNew(true);
    setNotice(null);
    setDraft({ ...EMPTY, kind: "legal", slug, title, date: new Date().toISOString().slice(0, 10) });
  }

  function startPost() {
    setIsNew(true);
    setNotice(null);
    setDraft({ ...EMPTY, kind: "blog", date: new Date().toISOString().slice(0, 10) });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await staffApi.saveContent(draft.kind, draft.slug, {
        title: draft.title, excerpt: draft.excerpt, body: draft.body,
        read_minutes: Number(draft.read_minutes) || 3, published: draft.published, date: draft.date,
      });
      setNotice(draft.published ? "Published. The website updates within a minute." : "Saved as a draft (not visible to the public).");
      setIsNew(false);
      await load();
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft || !window.confirm("Delete this page? The website goes back to its built-in text for it.")) return;
    try {
      await staffApi.deleteContent(draft.kind, draft.slug);
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Failed to delete");
    }
  }

  const field = "mt-1 w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/staff" className="text-[13px] font-semibold text-fg-muted hover:text-fg">&larr; Workspaces</Link>
        <h1 className="mt-2 text-xl font-bold">Website content</h1>
        <p className="text-sm text-fg-muted">
          Edit legal pages and blog posts without a deploy. Until a page is published here, the website shows its
          built-in text.
        </p>
      </div>

      {error && <div className="text-sm text-danger bg-danger-soft rounded p-2">{error}</div>}
      {notice && <div className="text-sm bg-surface-2 rounded p-2">{notice}</div>}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-5">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-fg-faint">Legal pages</h2>
            <ul className="mt-2 space-y-1">
              {LEGAL_SLUGS.map((l) => {
                const row = items.find((i) => i.kind === "legal" && i.slug === l.slug);
                return (
                  <li key={l.slug}>
                    <button
                      onClick={() => startLegal(l.slug, l.title)}
                      className="w-full text-left rounded-lg px-3 py-2 text-[13px] hover:bg-surface-2 flex justify-between"
                    >
                      <span>{l.title}</span>
                      <span className="text-fg-faint">{row ? (row.published ? "Live" : "Draft") : "Built-in"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-fg-faint">Blog posts</h2>
              <button onClick={startPost} className="text-[12.5px] font-semibold text-accent">+ New post</button>
            </div>
            <ul className="mt-2 space-y-1">
              {items.filter((i) => i.kind === "blog").map((p) => (
                <li key={p.slug}>
                  <button
                    onClick={() => edit(p)}
                    className="w-full text-left rounded-lg px-3 py-2 text-[13px] hover:bg-surface-2 flex justify-between gap-2"
                  >
                    <span className="truncate">{p.title}</span>
                    <span className="text-fg-faint">{p.published ? "Live" : "Draft"}</span>
                  </button>
                </li>
              ))}
              {items.filter((i) => i.kind === "blog").length === 0 && (
                <li className="px-3 text-[12.5px] text-fg-faint">No posts yet. The 3 built-in posts still show.</li>
              )}
            </ul>
          </div>
        </aside>

        {draft ? (
          <form onSubmit={save} className="space-y-4 max-w-2xl">
            <div>
              <label htmlFor="c-title" className="text-[12.5px] font-medium">Title</label>
              <input id="c-title" required className={field} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            {draft.kind === "blog" && (
              <>
                <div>
                  <label htmlFor="c-slug" className="text-[12.5px] font-medium">URL slug</label>
                  <input
                    id="c-slug" required disabled={!isNew} className={field} placeholder="my-first-post"
                    value={draft.slug}
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                  />
                  <p className="text-[11px] text-fg-faint mt-1">Lowercase letters, numbers and hyphens. Can&apos;t be changed after saving.</p>
                </div>
                <div>
                  <label htmlFor="c-excerpt" className="text-[12.5px] font-medium">Short summary (shown on the blog list)</label>
                  <input id="c-excerpt" className={field} maxLength={500} value={draft.excerpt} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} />
                </div>
                <div className="w-32">
                  <label htmlFor="c-read" className="text-[12.5px] font-medium">Read time (min)</label>
                  <input id="c-read" type="number" min={1} className={field} value={draft.read_minutes} onChange={(e) => setDraft({ ...draft, read_minutes: Number(e.target.value) })} />
                </div>
              </>
            )}
            <div className="w-48">
              <label htmlFor="c-date" className="text-[12.5px] font-medium">{draft.kind === "legal" ? "Last updated" : "Publish date"}</label>
              <input id="c-date" type="date" className={field} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c-body" className="text-[12.5px] font-medium">Body</label>
              <p className="text-[11px] text-fg-faint mb-1">
                Separate paragraphs with a blank line.{" "}
                {draft.kind === "legal" && <>Start a line with <code>## </code> to begin a new headed section, e.g. <code>## What we collect</code>.</>}
              </p>
              <textarea id="c-body" className={`${field} h-80 font-mono`} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} />
              Published (visible on the website)
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
              {!isNew && (
                <button type="button" onClick={remove} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-danger border border-border">
                  Delete
                </button>
              )}
            </div>
          </form>
        ) : (
          <p className="text-sm text-fg-muted">Pick a legal page or a blog post on the left, or start a new post.</p>
        )}
      </div>
    </div>
  );
}
