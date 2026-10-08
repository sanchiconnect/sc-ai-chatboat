export interface ProductCard {
  product_id: string;
  name: string;
  price: string;
  description: string;
  image_url: string;
  url: string;
}

export interface ChatEvent {
  type: "delta" | "done" | "handoff" | "conversation" | "message_saved";
  text?: string;
  no_answer?: boolean;
  sources?: { url: string | null; chunk_id: string }[];
  conversation_id?: string;
  handed_off?: boolean;
  message_id?: string;
  follow_ups?: string[];
  products?: ProductCard[];
}

export interface ChatHistoryTurn {
  role: "visitor" | "bot";
  content: string;
}

/**
 * Streams chat events from POST /public/w/{botId}/chat. Plain EventSource
 * doesn't support POST bodies, so this parses SSE frames by hand over a
 * fetch() ReadableStream instead.
 */
export async function* streamChat(
  apiBase: string,
  botId: string,
  message: string,
  history: ChatHistoryTurn[],
  businessName: string,
  conversationId: string | null,
  visitorId: string,
): AsyncGenerator<ChatEvent> {
  const resp = await fetch(`${apiBase}/public/w/${botId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history,
      business_name: businessName,
      conversation_id: conversationId,
      visitor_id: visitorId,
      page_url: typeof location !== "undefined" ? location.href : "",
    }),
  });

  if (!resp.ok || !resp.body) {
    yield { type: "delta", text: "Sorry, something went wrong connecting to the assistant." };
    yield { type: "done", no_answer: true, sources: [] };
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (line) {
        yield JSON.parse(line.slice(6)) as ChatEvent;
      }
    }
  }
}

export interface PolledMessage {
  id: string;
  role: "visitor" | "bot" | "agent" | "system";
  content: string;
  created_at: string;
}

/** Polls for agent replies once a conversation has been handed off to a human. */
export async function pollMessages(
  apiBase: string,
  botId: string,
  conversationId: string,
  afterId: string | null,
): Promise<{ status: string; messages: PolledMessage[] } | null> {
  try {
    const url = new URL(`${apiBase}/public/w/${botId}/conversations/${conversationId}/messages`);
    if (afterId) url.searchParams.set("after", afterId);
    const resp = await fetch(url.toString());
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function sendTriggerEvent(
  apiBase: string, botId: string, triggerId: string, event: "shown" | "clicked", visitorId: string,
): Promise<void> {
  try {
    await fetch(`${apiBase}/public/w/${botId}/trigger-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger_id: triggerId, event, visitor_id: visitorId }),
      keepalive: true,
    });
  } catch {
    /* analytics only — never disturb the visitor */
  }
}

export async function rateMessage(apiBase: string, botId: string, messageId: string, rating: 1 | -1): Promise<boolean> {
  try {
    const resp = await fetch(`${apiBase}/public/w/${botId}/messages/${messageId}/rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function submitLead(
  apiBase: string,
  botId: string,
  conversationId: string,
  lead: { name: string; email: string; phone: string },
): Promise<boolean> {
  try {
    const resp = await fetch(`${apiBase}/public/w/${botId}/lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, ...lead }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function submitCsat(
  apiBase: string,
  botId: string,
  conversationId: string,
  rating: number,
): Promise<boolean> {
  try {
    const resp = await fetch(`${apiBase}/public/w/${botId}/conversations/${conversationId}/csat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function emailTranscript(
  apiBase: string,
  botId: string,
  conversationId: string,
  email: string,
): Promise<boolean> {
  try {
    const resp = await fetch(`${apiBase}/public/w/${botId}/transcript/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, email }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return Boolean(data.sent);
  } catch {
    return false;
  }
}
