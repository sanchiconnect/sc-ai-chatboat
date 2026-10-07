import { render } from "preact";
import { Widget, type WidgetController } from "./Widget";
import cssText from "./styles.css?inline";
import type { Trigger } from "./triggers";

// document.currentScript is only valid during this script's own synchronous
// execution — captured here, at module top level, since boot() may run
// later (after DOMContentLoaded) when it would already be null.
const scriptEl = document.currentScript as HTMLScriptElement | null;

// JS API (FR-I4) — SanchiJawab.open()/close()/identify() work from the
// moment the script tag is parsed, even though boot() hasn't finished its
// async config fetch yet: calls made before the real Widget mounts just
// queue up and replay once it's ready, same pattern most chat-widget SDKs
// use (Intercom, Crisp, etc.) so a host page's own script never has to
// wait for us.
type QueuedCall = { method: keyof WidgetController; arg?: unknown };
const callQueue: QueuedCall[] = [];

function installQueueShim() {
  const w = window as unknown as { SanchiJawab?: Record<string, (...a: unknown[]) => void> };
  if (w.SanchiJawab && (w.SanchiJawab as { _sjReal?: boolean })._sjReal) return;
  // The copy-paste loader snippet (Install page) defines its own tiny
  // SanchiJawab stub with a `_q` of [method, args] pairs recorded before this
  // file finished loading — fold those into the real queue instead of
  // overwriting the stub and losing them.
  const early = (w.SanchiJawab as unknown as { _q?: [keyof WidgetController, unknown[]][] } | undefined)?._q;
  if (Array.isArray(early)) {
    for (const [method, args] of early) callQueue.push({ method, arg: args?.[0] });
  }
  w.SanchiJawab = {
    open: () => callQueue.push({ method: "open" }),
    close: () => callQueue.push({ method: "close" }),
    identify: (info: unknown) => callQueue.push({ method: "identify", arg: info }),
  };
}
installQueueShim();

function installRealController(controller: WidgetController) {
  const real = {
    open: controller.open,
    close: controller.close,
    identify: (info: { name?: string; email?: string }) => controller.identify(info),
    _sjReal: true,
  };
  (window as unknown as { SanchiJawab: typeof real }).SanchiJawab = real;
  for (const call of callQueue.splice(0)) {
    if (call.method === "identify") controller.identify((call.arg as { name?: string; email?: string }) || {});
    else if (call.method === "open") controller.open();
    else if (call.method === "close") controller.close();
  }
}

interface RemoteConfig {
  business_name: string;
  primary_color: string;
  position: string;
  welcome_message: string;
  require_consent?: boolean;
  consent_text?: string;
  avatar_id?: string;
  avatar_name?: string;
  offsets?: { x: number; y: number };
  devices?: { desktop: boolean; mobile: boolean };
  hidden_paths?: string[];
  starter_questions?: string[];
  hide_branding?: boolean;
  locale?: string;
  theme?: string;
  show_sources?: boolean;
  triggers?: Trigger[];
}

async function fetchConfig(apiBase: string, botId: string): Promise<RemoteConfig | null> {
  try {
    const resp = await fetch(`${apiBase}/public/w/${botId}/config`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null; // offline/network error — fall back to data-* attributes below
  }
}

// Same 480px breakpoint the widget's own CSS already uses to switch the
// chat panel to fullscreen — "mobile" here means the same thing it means
// there, not an attempt to sniff the actual device.
const MOBILE_BREAKPOINT = 480;

function isDeviceAllowed(devices: RemoteConfig["devices"]): boolean {
  if (!devices) return true;
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  return isMobile ? devices.mobile !== false : devices.desktop !== false;
}

// A pattern ending in "*" is a prefix match (e.g. "/checkout*" hides
// "/checkout" and "/checkout/step1"); anything else is a plain substring
// match — same convention as the dashboard's other pattern fields
// (handoff keywords, routing rules' page_pattern).
function isPathHidden(patterns: string[] | undefined, pathname: string): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((raw) => {
    const pattern = raw.trim();
    if (!pattern) return false;
    if (pattern.endsWith("*")) return pathname.startsWith(pattern.slice(0, -1));
    return pathname.includes(pattern);
  });
}

async function boot() {
  // Pasting the snippet twice (or a CMS rendering it in two places) must not
  // mount two chat bubbles.
  // The flag is set synchronously: boot() awaits a network call before it
  // mounts, so two copies would otherwise both pass a DOM-only check.
  const flagged = window as unknown as { __sjBooted?: boolean };
  if (flagged.__sjBooted || document.getElementById("sanchijawab-widget-host")) return;
  flagged.__sjBooted = true;

  // Two ways to configure: data-* attributes on the script tag, or the
  // `window.__sj = { botId, api }` object the copy-paste loader sets (the
  // loader injects this file as a script tag with the same data-* anyway).
  const ds = scriptEl?.dataset ?? {};
  const cfg = (window as unknown as { __sj?: { botId?: string; api?: string } }).__sj ?? {};

  const botId = ds.bot || cfg.botId;
  if (!botId) {
    console.error("SanchiJawab widget: missing data-bot attribute on the script tag.");
    return;
  }

  // data-api lets local/staging embeds point at a different backend; falls
  // back to the origin the script itself was served from.
  const apiBase = ds.api || cfg.api || new URL(scriptEl!.src).origin;

  // Remote config (set from the dashboard's Widget settings page) is the
  // source of truth; data-* attributes are only a fallback if the fetch
  // fails, not an override — otherwise editing the dashboard would never
  // visibly change anything already-installed on a customer's site.
  const remote = await fetchConfig(apiBase, botId);

  // Device + URL visibility rules (SAN-1101, FR-W6) — decided once, at
  // boot, before anything is mounted: there's no reactive chrome to hide
  // later, and re-checking on every SPA route change would need a router
  // integration this script deliberately doesn't have.
  if (remote && (!isDeviceAllowed(remote.devices) || isPathHidden(remote.hidden_paths, window.location.pathname))) {
    return;
  }

  const host = document.createElement("div");
  host.id = "sanchijawab-widget-host";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = cssText;
  shadow.appendChild(style);

  const mount = document.createElement("div");
  shadow.appendChild(mount);

  render(
    <Widget
      apiBase={apiBase}
      botId={botId}
      businessName={remote?.business_name || ds.business || "Chat with us"}
      primaryColor={remote?.primary_color || ds.color || "#3D46C9"}
      welcomeMessage={remote?.welcome_message || ds.welcome || "Hi! Ask me anything."}
      requireConsent={remote?.require_consent ?? true}
      consentText={
        remote?.consent_text ||
        "By using this chat, you agree that your messages may be stored and used to provide support. Don't share sensitive personal information."
      }
      avatarId={remote?.avatar_id || "orbit"}
      avatarName={remote?.avatar_name || ""}
      position={remote?.position === "left" ? "left" : "right"}
      offsetX={remote?.offsets?.x ?? 20}
      offsetY={remote?.offsets?.y ?? 20}
      starterQuestions={remote?.starter_questions || []}
      hideBranding={remote?.hide_branding ?? false}
      showSources={remote?.show_sources ?? true}
      triggers={remote?.triggers ?? []}
      locale={remote?.locale || ds.locale || "en"}
      theme={remote?.theme === "dark" ? "dark" : "light"}
      onReady={installRealController}
    />,
    mount,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
