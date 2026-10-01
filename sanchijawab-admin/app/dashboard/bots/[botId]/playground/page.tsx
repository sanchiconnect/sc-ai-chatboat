"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { API_URL } from "@/lib/api";

interface Message {
  role: "visitor" | "bot";
  content: string;
  sources?: { url: string | null }[];
  error?: boolean;
}

export default function PlaygroundPage() {
  const { botId } = useParams<{ botId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "visitor", content: text }, { role: "bot", content: "" }]);
    setInput("");
    setSending(true);

    try {
      const resp = await fetch(`${API_URL}/public/w/${botId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, business_name: "your bot" }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${resp.status})`);
      }
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6));

          if (event.type === "delta") {
            setMessages((m) => {
              const next = [...m];
              next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + event.text };
              return next;
            });
          } else if (event.type === "done") {
            setMessages((m) => {
              const next = [...m];
              next[next.length - 1] = { ...next[next.length - 1], sources: event.sources };
              return next;
            });
          } else if (event.type === "handoff") {
            setMessages((m) => {
              const next = [...m];
              next[next.length - 1] = {
                role: "bot",
                content: "(This would hand off to a human agent in the real widget.)",
              };
              return next;
            });
          }
        }
      }
    } catch (err) {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: "bot",
          error: true,
          content: err instanceof Error ? `Something went wrong: ${err.message}` : "Something went wrong.",
        };
        return next;
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-bold mb-4">Playground</h2>
      <p className="text-sm text-fg-muted mb-4">
        Test questions here — not billed, doesn&apos;t appear in analytics.
      </p>

      <div className="bg-surface border border-border rounded-lg p-4 h-96 overflow-y-auto flex flex-col gap-3 mb-3">
        {messages.length === 0 && <p className="text-fg-faint text-sm">Ask a test question below.</p>}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === "visitor"
                ? "self-end bg-accent text-white"
                : m.error
                  ? "self-start bg-danger-soft text-danger border border-danger"
                  : "self-start bg-surface-2"
            }`}
          >
            {m.content || (m.role === "bot" && !m.error ? (
              <span className="inline-flex items-center gap-1 text-fg-faint">
                <span className="animate-bounce">●</span>
                <span className="animate-bounce [animation-delay:0.15s]">●</span>
                <span className="animate-bounce [animation-delay:0.3s]">●</span>
              </span>
            ) : null)}
            {m.sources && m.sources.length > 0 && (
              <div className="mt-1 flex gap-2 text-xs">
                {m.sources
                  .filter((s) => s.url)
                  .map((s, j) => (
                    <a key={j} href={s.url!} target="_blank" rel="noreferrer" className="underline">
                      Source
                    </a>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          className="flex-1 border border-border rounded-lg px-3 py-2"
          placeholder="Ask a test question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending}
          className="bg-accent text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
