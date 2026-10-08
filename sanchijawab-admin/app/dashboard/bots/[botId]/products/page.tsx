"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, type ProductInput, type ProductRow } from "@/lib/api";

const EMPTY: ProductInput = { name: "", price: "", description: "", image_url: "", url: "" };
const SAMPLE_CSV = "name,price,description,image_url,url\nRed Mug,₹299,Ceramic mug that holds 350 ml,https://example.com/mug.jpg,https://example.com/mug\n";

export default function ProductsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [items, setItems] = useState<ProductRow[]>([]);
  const [form, setForm] = useState<ProductInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api.listProducts(botId).then(setItems).catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load products"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (editingId) await api.editProduct(editingId, form);
      else await api.addProduct(botId, form);
      setForm(EMPTY);
      setEditingId(null);
      setNotice("Saved.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this product?")) return;
    await api.deleteProduct(id);
    await load();
  }

  async function clearAll() {
    if (!window.confirm(`Delete all ${items.length} products? This can't be undone.`)) return;
    await api.clearProducts(botId);
    await load();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.importProducts(botId, file);
      setNotice(
        `Imported ${res.imported} product(s).` +
          (res.problem_count ? ` ${res.problem_count} row(s) skipped: ${res.problems.slice(0, 3).join("; ")}${res.problem_count > 3 ? "…" : ""}` : ""),
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "products-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const field = "mt-1 w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-bold">Products</h2>
        <p className="text-sm text-fg-muted">
          Add what you sell. When a visitor asks about something related, the assistant mentions it and shows it as a card
          (picture, price and a link) under its answer. Products are matched by meaning, so &ldquo;something to carry my laptop&rdquo;
          finds a laptop bag. Cards only appear for a clear match.
        </p>
      </div>

      {error && <div className="text-sm text-danger bg-danger-soft rounded p-2">{error}</div>}
      {notice && <div className="text-sm bg-surface-2 rounded p-2">{notice}</div>}

      <form onSubmit={save} className="bg-surface border border-border rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">{editingId ? "Edit product" : "Add a product"}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="p-name" className="text-[12.5px] font-medium">Name</label>
            <input id="p-name" required maxLength={255} className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="p-price" className="text-[12.5px] font-medium">Price (as you want it shown)</label>
            <input id="p-price" maxLength={50} placeholder="₹499" className={field} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
        </div>
        <div>
          <label htmlFor="p-desc" className="text-[12.5px] font-medium">Description</label>
          <textarea id="p-desc" maxLength={2000} className={`${field} h-20`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="p-img" className="text-[12.5px] font-medium">Picture link (optional)</label>
            <input id="p-img" placeholder="https://…/photo.jpg" className={field} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
          </div>
          <div>
            <label htmlFor="p-url" className="text-[12.5px] font-medium">Product page link (optional)</label>
            <input id="p-url" placeholder="https://…/product" className={field} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50">
            {editingId ? "Save changes" : "Add product"}
          </button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-fg-muted">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
        <h3 className="text-sm font-semibold">Import many at once</h3>
        <p className="text-[12.5px] text-fg-muted">
          Upload a CSV with a header row: <code>name</code> (required), <code>price</code>, <code>description</code>,{" "}
          <code>image_url</code>, <code>url</code>. Up to 500 rows per file.{" "}
          <button type="button" onClick={downloadSample} className="underline font-medium">Download a sample</button>
        </p>
        <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="Choose a CSV file" disabled={busy} onChange={onFile} className="text-[13px]" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">{items.length} product{items.length === 1 ? "" : "s"}</h3>
          {items.length > 0 && (
            <button type="button" onClick={clearAll} className="text-danger text-[12.5px] font-semibold">Delete all</button>
          )}
        </div>
        <ul className="divide-y divide-border border border-border rounded-2xl bg-surface">
          {items.map((p) => (
            <li key={p.product_id} className="p-3 flex gap-3 items-start">
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_url} alt="" className="w-12 h-12 rounded-lg object-cover bg-surface-2 flex-none" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-surface-2 flex-none" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium">{p.name} {p.price && <span className="text-fg-muted font-normal">· {p.price}</span>}</div>
                {p.description && <div className="text-[12.5px] text-fg-muted line-clamp-2">{p.description}</div>}
              </div>
              <div className="flex gap-3 text-[12.5px] font-semibold flex-none">
                <button type="button" onClick={() => { setEditingId(p.product_id); setForm({ name: p.name, price: p.price, description: p.description, image_url: p.image_url, url: p.url }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                <button type="button" className="text-danger" onClick={() => remove(p.product_id)}>Delete</button>
              </div>
            </li>
          ))}
          {items.length === 0 && <li className="p-4 text-[13px] text-fg-faint">No products yet.</li>}
        </ul>
      </div>
    </div>
  );
}
