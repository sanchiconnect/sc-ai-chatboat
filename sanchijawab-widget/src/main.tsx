import { render } from "preact";
import { Widget } from "./Widget";
import cssText from "./styles.css?inline";

// document.currentScript is only valid during this script's own synchronous
// execution — captured here, at module top level, since boot() may run
// later (after DOMContentLoaded) when it would already be null.
const scriptEl = document.currentScript as HTMLScriptElement | null;

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
  const ds = scriptEl?.dataset ?? {};

  const botId = ds.bot;
  if (!botId) {
    console.error("SanchiJawab widget: missing data-bot attribute on the script tag.");
    return;
  }

  // data-api lets local/staging embeds point at a different backend; falls
  // back to the origin the script itself was served from.
  const apiBase = ds.api || new URL(scriptEl!.src).origin;

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
    />,
    mount,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
