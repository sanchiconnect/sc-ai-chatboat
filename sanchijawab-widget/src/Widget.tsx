import { useEffect, useRef, useState } from "preact/hooks";
import { streamChat, pollMessages, submitLead, rateMessage, type ChatHistoryTurn } from "./api";
import { renderMarkdown } from "./markdown";
import { BotAvatar } from "./avatars";
import { stringsFor, type WidgetStrings } from "./i18n";

export interface WidgetProps {
  apiBase: string;
  botId: string;
  businessName: string;
  primaryColor: string;
  welcomeMessage: string;
  requireConsent: boolean;
  consentText: string;
  avatarId: string;
  avatarName: string;
  position: "left" | "right";
  offsetX: number;
  offsetY: number;
  starterQuestions: string[];
  hideBranding: boolean;
  locale: string;
}

interface Message {
  role: "visitor" | "bot" | "agent";
  content: string;
  sources?: { url: string | null }[];
  pending?: boolean;
  leadForm?: boolean;
  messageId?: string;
  rated?: 1 | -1;
  followUps?: string[];
}

function downloadTranscript(botId: string, messages: Message[]) {
  const roleLabel: Record<Message["role"], string> = { visitor: "You", bot: "Bot", agent: "Agent" };
  const text = messages
    .filter((m) => m.content)
    .map((m) => `${roleLabel[m.role]}: ${m.content}`)
    .join("\n\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chat-transcript-${botId}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

const STORAGE_PREFIX = "sanchijawab:";

function loadHistory(botId: string): Message[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + botId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(botId: string, messages: Message[]) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + botId, JSON.stringify(messages));
  } catch {
    // Private browsing / storage disabled — conversation just won't persist
    // across page navigation. Not fatal.
  }
}

function loadConversationId(botId: string): string | null {
  try {
    return sessionStorage.getItem(STORAGE_PREFIX + botId + ":conv");
  } catch {
    return null;
  }
}

function getOrCreateVisitorId(botId: string): string {
  const key = STORAGE_PREFIX + botId + ":visitor";
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

// Consent persists per browser (localStorage, not sessionStorage) — once
// given, a visitor isn't re-prompted on their next visit. "declined" is
// tracked separately so a decline isn't silently treated the same as never
// having been asked.
function loadConsent(botId: string): "accepted" | "declined" | null {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + botId + ":consent");
    return v === "accepted" || v === "declined" ? v : null;
  } catch {
    return null;
  }
}

function saveConsent(botId: string, value: "accepted" | "declined") {
  try {
    localStorage.setItem(STORAGE_PREFIX + botId + ":consent", value);
  } catch {
    // ignore — worst case, re-prompted next visit
  }
}

function ConsentGate({
  text, primaryColor, onAccept, onDecline, t,
}: { text: string; primaryColor: string; onAccept: () => void; onDecline: () => void; t: WidgetStrings }) {
  return (
    <div class="sj-consent-gate">
      <p class="sj-consent-text">{text}</p>
      <div class="sj-consent-actions">
        <button type="button" class="sj-consent-decline" onClick={onDecline}>
          {t.consentDecline}
        </button>
        <button type="button" class="sj-send" style={{ background: primaryColor }} onClick={onAccept}>
          {t.consentAccept}
        </button>
      </div>
    </div>
  );
}

function LeadForm({ onSubmit, onSkip, t }: { onSubmit: (v: { name: string; email: string; phone: string }) => void; onSkip: () => void; t: WidgetStrings }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <form
      class="sj-lead-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, email, phone });
      }}
    >
      <input class="sj-input" placeholder={t.leadName} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      <input class="sj-input" placeholder={t.leadEmail} value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
      <input class="sj-input" placeholder={t.leadPhone} value={phone} onInput={(e) => setPhone((e.target as HTMLInputElement).value)} />
      <div class="sj-lead-actions">
        <button type="submit" class="sj-send">{t.leadSend}</button>
        <button type="button" class="sj-lead-skip" onClick={onSkip}>{t.leadSkip}</button>
      </div>
    </form>
  );
}

export function Widget(props: WidgetProps) {
  const t = stringsFor(props.locale);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => loadHistory(props.botId));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(() => loadConversationId(props.botId));
  const [handedOff, setHandedOff] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [consent, setConsent] = useState<"accepted" | "declined" | null>(() => loadConsent(props.botId));
  const visitorIdRef = useRef<string>(getOrCreateVisitorId(props.botId));
  const lastPolledIdRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveHistory(props.botId, messages), [messages, props.botId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    try {
      if (conversationId) sessionStorage.setItem(STORAGE_PREFIX + props.botId + ":conv", conversationId);
    } catch {
      // ignore
    }
  }, [conversationId, props.botId]);

  // If reopening a conversation that was already handed off in an earlier
  // session on this tab, learn that immediately so polling starts without
  // waiting for the visitor to send another message.
  useEffect(() => {
    if (!conversationId) return;
    pollMessages(props.apiBase, props.botId, conversationId, null).then((result) => {
      if (result && (result.status === "waiting" || result.status === "human")) setHandedOff(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for agent replies once a human has taken over — the widget has no
  // realtime channel (no websockets), so this is a deliberate simple
  // trade-off: a few seconds of latency on agent replies, not instant.
  useEffect(() => {
    if (!open || !conversationId || !handedOff) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      const result = await pollMessages(props.apiBase, props.botId, conversationId, lastPolledIdRef.current);
      if (cancelled || !result) return;
      if (result.messages.length > 0) {
        lastPolledIdRef.current = result.messages[result.messages.length - 1].id;
        const agentMsgs = result.messages.filter((m) => m.role === "agent");
        if (agentMsgs.length > 0) {
          setMessages((m) => [...m, ...agentMsgs.map((am) => ({ role: "agent" as const, content: am.content }))]);
        }
      }
      if (result.status === "closed" || result.status === "bot") setHandedOff(false);
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, conversationId, handedOff, props.apiBase, props.botId]);

  const consentBlocking = props.requireConsent && consent !== "accepted";

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending || consentBlocking) return;

    const history: ChatHistoryTurn[] = messages
      .filter((m) => !m.pending && (m.role === "visitor" || m.role === "bot"))
      .map((m) => ({ role: m.role as "visitor" | "bot", content: m.content }));

    setMessages((m) => [...m, { role: "visitor", content: trimmed }, { role: "bot", content: "", pending: true }]);
    setInput("");
    setSending(true);

    try {
      for await (const event of streamChat(
        props.apiBase, props.botId, trimmed, history, props.businessName, conversationId, visitorIdRef.current,
      )) {
        if (event.type === "conversation") {
          if (event.conversation_id) setConversationId(event.conversation_id);
        } else if (event.type === "delta") {
          setMessages((m) => {
            const next = [...m];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + (event.text ?? "") };
            return next;
          });
        } else if (event.type === "done") {
          setMessages((m) => {
            const next = [...m];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, pending: false, sources: event.sources, followUps: event.follow_ups };
            return next;
          });
          if (event.handed_off) setHandedOff(true);
        } else if (event.type === "message_saved") {
          setMessages((m) => {
            const next = [...m];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, messageId: event.message_id };
            return next;
          });
        } else if (event.type === "handoff") {
          setHandedOff(true);
          setMessages((m) => {
            const next = [...m];
            next[next.length - 1] = {
              role: "bot",
              content: t.connectingToTeam,
              leadForm: !leadSubmitted,
            };
            return next;
          });
        }
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      class={`sj-root ${props.position === "left" ? "sj-pos-left" : ""}`}
      style={{ "--sj-offset-x": `${props.offsetX}px`, "--sj-offset-y": `${props.offsetY}px` }}
    >
      {open && (
        <div class="sj-panel">
          <div class="sj-header" style={{ background: props.primaryColor }}>
            <div class="sj-header-identity">
              <BotAvatar avatarId={props.avatarId} size={30} />
              <div class="sj-header-text">
                <span class="sj-header-name">{props.avatarName || props.businessName}</span>
                {props.avatarName && <span class="sj-header-sub">{props.businessName}</span>}
              </div>
            </div>
            <div class="sj-header-actions">
              <button
                class="sj-close"
                onClick={() => downloadTranscript(props.botId, messages)}
                aria-label={t.downloadTranscript}
                title={t.downloadTranscript}
              >
                {"\u2B07"}
              </button>
              <button class="sj-close" onClick={() => setOpen(false)} aria-label={t.closeChat}>
                {"\u2715"}
              </button>
            </div>
          </div>

          <div class="sj-messages" ref={listRef}>
            {messages.length === 0 && (
              <>
                <div class="sj-bubble sj-bubble-bot">{props.welcomeMessage}</div>
                {props.starterQuestions.length > 0 && (
                  <div class="sj-chips">
                    {props.starterQuestions.map((q, i) => (
                      <button key={i} type="button" class="sj-chip" onClick={() => send(q)} disabled={consentBlocking}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {messages.map((m, i) => (
              <div key={i} class={`sj-bubble sj-bubble-${m.role}`}>
                {m.role === "agent" && <div class="sj-agent-label">{t.agentLabel}</div>}
                {m.role === "visitor" ? (
                  m.content
                ) : m.content ? (
                  <span dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                ) : (
                  m.pending ? "\u2026" : ""
                )}
                {m.role === "bot" && m.messageId && !m.pending && (
                  <div class="sj-rating">
                    <button
                      class={`sj-rate-btn ${m.rated === 1 ? "sj-rate-active" : ""}`}
                      aria-label={t.goodAnswer}
                      onClick={async () => {
                        if (!m.messageId) return;
                        setMessages((cur) => {
                          const next = [...cur];
                          next[i] = { ...next[i], rated: 1 };
                          return next;
                        });
                        await rateMessage(props.apiBase, props.botId, m.messageId, 1);
                      }}
                    >
                      {"\u{1F44D}"}
                    </button>
                    <button
                      class={`sj-rate-btn ${m.rated === -1 ? "sj-rate-active" : ""}`}
                      aria-label={t.badAnswer}
                      onClick={async () => {
                        if (!m.messageId) return;
                        setMessages((cur) => {
                          const next = [...cur];
                          next[i] = { ...next[i], rated: -1 };
                          return next;
                        });
                        await rateMessage(props.apiBase, props.botId, m.messageId, -1);
                      }}
                    >
                      {"\u{1F44E}"}
                    </button>
                  </div>
                )}
                {m.sources && m.sources.length > 0 && (
                  <div class="sj-sources">
                    {m.sources
                      .filter((s) => s.url)
                      .map((s, j, arr) => (
                        <a key={j} href={s.url!} target="_blank" rel="noreferrer">
                          {arr.length > 1 ? t.sourceN(j + 1) : t.source}
                        </a>
                      ))}
                  </div>
                )}
                {m.leadForm && !leadSubmitted && (
                  <LeadForm
                    onSubmit={async (v) => {
                      setLeadSubmitted(true);
                      if (conversationId) await submitLead(props.apiBase, props.botId, conversationId, v);
                    }}
                    onSkip={() => setLeadSubmitted(true)}
                    t={t}
                  />
                )}
                {m.role === "bot" && !m.pending && i === messages.length - 1 && m.followUps && m.followUps.length > 0 && !handedOff && (
                  <div class="sj-chips">
                    {m.followUps.map((q, j) => (
                      <button key={j} type="button" class="sj-chip" onClick={() => send(q)} disabled={sending || consentBlocking}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {consentBlocking && consent !== "declined" && (
            <ConsentGate
              text={props.consentText}
              primaryColor={props.primaryColor}
              onAccept={() => {
                setConsent("accepted");
                saveConsent(props.botId, "accepted");
              }}
              onDecline={() => {
                setConsent("declined");
                saveConsent(props.botId, "declined");
              }}
              t={t}
            />
          )}
          {consentBlocking && consent === "declined" && (
            <div class="sj-consent-gate">
              <p class="sj-consent-text">
                {t.consentUnavailable}{" "}
                <button
                  type="button"
                  class="sj-consent-rethink"
                  onClick={() => setConsent(null)}
                >
                  {t.consentChangeMind}
                </button>
              </p>
            </div>
          )}

          <form
            class="sj-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              class="sj-input"
              value={input}
              placeholder={t.inputPlaceholder}
              onInput={(e) => setInput((e.target as HTMLInputElement).value)}
              disabled={sending || consentBlocking}
            />
            <button
              class="sj-send"
              type="submit"
              disabled={sending || consentBlocking}
              style={{ background: props.primaryColor }}
            >
              {"\u27A4"}
            </button>
          </form>
          {!props.hideBranding && <div class="sj-powered">{t.poweredBy}</div>}
        </div>
      )}

      <button
        class="sj-launcher"
        style={{ background: open ? props.primaryColor : "transparent" }}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? t.closeChat : t.openChat}
      >
        {open ? <span class="sj-launcher-close">{"\u2715"}</span> : <BotAvatar avatarId={props.avatarId} size={56} />}
      </button>
    </div>
  );
}
