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
    />,
    mount,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
