"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { staffApi, StaffApiError, StaffContentItem } from "@/lib/staff-api";
import { blogPosts } from "@/lib/blog-posts";

const LEGAL_PAGES = [
  { slug: "privacy", title: "Privacy Policy", url: "/legal/privacy" },
  { slug: "terms", title: "Terms of Service", url: "/legal/terms" },
  { slug: "cookies", title: "Cookie Policy", url: "/legal/cookies" },
  { slug: "dpa", title: "Data Processing Addendum", url: "/legal/dpa" },
  { slug: "security", title: "Security", url: "/legal/security" },
];

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { kind: "blog", slug: "", title: "", excerpt: "", body: "", read_minutes: 3, published: false, date: "" };
type Draft = typeof EMPTY;

function StatusChip({ state }: { state: "live" | "draft" | "builtin" | "missing" }) {
  const map = {
    live: { label: "Live", cls: "text-success bg-success-soft" },
    draft: { label: "Draft", cls: "text-warning bg-warning-soft" },
    builtin: { label: "Built-in text", cls: "text-fg-muted bg-surface-2" },
    missing: { label: "Not added", cls: "text-fg-faint bg-surface-2" },
  }[state];
  return <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${map.cls}`}>{map.label}</span>;
}

export default function ContentPage() {
  const [items, setItems] = useState<StaffContentItem[]>([]);
  const [loaded, setLoaded] = useState(false);
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
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const customPosts = items.filter((i) => i.kind === "blog");
  const customSlugs = useMemo(() => new Set(customPosts.map((p) => p.slug)), [customPosts]);
  const untouchedBuiltIns = blogPosts.filter((p) => !customSlugs.has(p.slug));
  const legalRows = LEGAL_PAGES.map((l) => ({ ...l, row: items.find((i) => i.kind === "legal" && i.slug === l.slug) }));

  function open(next: Draft, creating: boolean) {
    setIsNew(creating);
    setNotice(null);
    setError(null);
    setDraft(next);
  }

  const edit = (item: StaffContentItem) => open({ ...item, date: item.date || "" }, false);

  function startLegal(slug: string, title: string, existing?: StaffContentItem) {
    if (existing) return edit(existing);
    open({ ...EMPTY, kind: "legal", slug, title, date: today() }, true);
  }

  function startPost() {
    open({ ...EMPTY, kind: "blog", date: today() }, true);
  }

  // A built-in post can be customized: its current text is copied into the editor and, once saved,
  // the saved version replaces the built-in one on the website.
  function customizeBuiltIn(slug: string) {
    const post = blogPosts.find((p) => p.slug === slug);
    if (!post) return;
    open({
      kind: "blog", slug: post.slug, title: post.title, excerpt: post.excerpt, body: post.body.join("\n\n"),
      read_minutes: post.readMinutes, published: true, date: post.date,
    }, true);
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
    setSaving(true);
    try {
      await staffApi.deleteContent(draft.kind, draft.slug);
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  const field = "mt-1 w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]";
  const selected = (kind: string, slug: string) => draft?.kind === kind && draft.slug === slug;
  const rowCls = (on: boolean) =>
    `w-full text-left rounded-xl border px-3 py-2.5 text-[13px] transition-colors flex items-center justify-between gap-2 ${
      on ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-2"
    }`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/staff" className="text-[13px] font-semibold text-fg-muted hover:text-fg">&larr; Workspaces</Link>
        <h1 className="mt-2 text-[24px] font-semibold font-display">Website content</h1>
        <p className="text-sm text-fg-muted max-w-2xl">
          Edit legal pages and blog posts without a deploy. Until a page is published here, the website shows its
          built-in text. The Home, Features and Pricing pages are fixed in the code; pricing plans are edited under
          <Link href="/staff/billing" className="font-semibold text-accent-ink"> Plans &amp; payments</Link>.
        </p>
      </div>

      {error && <div role="alert" className="text-sm text-danger bg-danger-soft rounded-lg p-3">{error}</div>}
      {notice && <div role="status" className="text-sm text-success bg-success-soft rounded-lg p-3">{notice}</div>}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-6">
          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-fg-faint">Legal pages</h2>
            <ul className="mt-2 space-y-2">
              {legalRows.map((l) => (
                <li key={l.slug}>
                  <button onClick={() => startLegal(l.slug, l.title, l.row)} className={rowCls(selected("legal", l.slug))} aria-current={selected("legal", l.slug) || undefined}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{l.title}</span>
                      <span className="block text-[11px] text-fg-faint">
                        {l.row ? `Edited ${new Date(l.row.updated_at + "Z").toLocaleDateString()}${l.row.updated_by ? ` by ${l.row.updated_by}` : ""}` : "Click to write your own version"}
                      </span>
                    </span>
                    <StatusChip state={l.row ? (l.row.published ? "live" : "draft") : "builtin"} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-fg-faint">Blog posts</h2>
              <button onClick={startPost} className="text-[12.5px] font-semibold text-accent-ink hover:underline">+ New post</button>
            </div>
            <ul className="mt-2 space-y-2">
              {!loaded && <li className="px-1 text-[12.5px] text-fg-faint">Loading…</li>}
              {customPosts.map((p) => (
                <li key={p.slug}>
                  <button onClick={() => edit(p)} className={rowCls(selected("blog", p.slug))} aria-current={selected("blog", p.slug) || undefined}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.title}</span>
                      <span className="block text-[11px] text-fg-faint">
                        {blogPosts.some((b) => b.slug === p.slug) ? "Replaces the built-in post" : `Added ${new Date(p.updated_at + "Z").toLocaleDateString()}`}
                      </span>
                    </span>
                    <StatusChip state={p.published ? "live" : "draft"} />
                  </button>
                </li>
              ))}
              {untouchedBuiltIns.map((p) => (
                <li key={p.slug}>
                  <button onClick={() => customizeBuiltIn(p.slug)} className={rowCls(false)}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.title}</span>
                      <span className="block text-[11px] text-fg-faint">Click to edit this post</span>
                    </span>
                    <StatusChip state="builtin" />
                  </button>
                </li>
              ))}
              {loaded && customPosts.length === 0 && untouchedBuiltIns.length === 0 && (
                <li className="px-1 text-[12.5px] text-fg-faint">No posts yet.</li>
              )}
            </ul>
          </section>
        </aside>

        {draft ? (
          <form onSubmit={save} className="page-enter max-w-2xl rounded-2xl border border-border bg-surface p-5 shadow-card">
            {/* Everything is locked while saving, so nothing can change under a request that is in flight. */}
            <fieldset disabled={saving} className="m-0 min-w-0 space-y-4 border-0 p-0">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-[18px] font-semibold">
                  {isNew ? "Add" : "Edit"} {draft.kind === "legal" ? "legal page" : "blog post"}
                </h2>
                {draft.kind === "legal" && (
                  <a href={LEGAL_PAGES.find((l) => l.slug === draft.slug)?.url} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-accent-ink hover:underline">
                    View on website ↗
                  </a>
                )}
              </div>
              <div>
                <label htmlFor="c-title" className="text-[12.5px] font-medium">Title</label>
                <input id="c-title" required className={field} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              {draft.kind === "blog" && (
                <>
                  <div>
                    <label htmlFor="c-slug" className="text-[12.5px] font-medium">URL slug</label>
                    <input
                      id="c-slug" required disabled={!isNew} className={`${field} disabled:opacity-60`} placeholder="my-first-post"
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
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-fg-muted hover:text-fg">
                  Close
                </button>
                {!isNew && (
                  <button type="button" onClick={remove} className="ml-auto rounded-lg px-4 py-2 text-[13px] font-semibold text-danger border border-border">
                    Delete
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-surface/60 p-8 text-center text-sm text-fg-muted">
            Pick a page on the left to edit it, or add a new blog post.
            <div className="mt-1 text-[12px] text-fg-faint">
              {legalRows.filter((l) => l.row?.published).length} of {LEGAL_PAGES.length} legal pages live ·{" "}
              {customPosts.filter((p) => p.published).length} custom posts live · {untouchedBuiltIns.length} built-in posts unchanged
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
