"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

/** Saves a question/answer pair as retrievable knowledge via the same
 * store_document() pipeline websites/files use (see services/qa.py) — not
 * an inert database row. Used both for genuinely unanswered questions
 * (Analytics page) and for correcting a wrong-but-answered one in a
 * transcript (Inbox page, FR-R3) — initialAnswer/label differ by caller.
 */
export function AddAnswerForm({
  question,
  onSaved,
  initialAnswer = "",
  label = "Add answer",
  savedLabel = "Added to knowledge base",
}: {
  question: string | null;
  onSaved: () => void;
  initialAnswer?: string;
  label?: string;
  savedLabel?: string;
}) {
  const { botId } = useParams<{ botId: string }>();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState(initialAnswer);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (saved) return <span className="text-xs text-success">{savedLabel}</span>;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-accent-ink underline">
        {label}
      </button>
    );
  }

  return (
    <div className="mt-2 flex gap-2">
      <input
        className="flex-1 border border-border rounded-lg px-2 py-1 text-sm"
        placeholder="Answer to save as knowledge…"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />
      <button
        disabled={saving || !answer.trim()}
        onClick={async () => {
          setSaving(true);
          try {
            await api.addQaPair(botId, question || "", answer.trim());
            setSaved(true);
            onSaved();
          } finally {
            setSaving(false);
          }
        }}
        className="bg-accent text-white rounded-lg px-3 py-1 text-sm disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
