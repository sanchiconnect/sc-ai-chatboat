export interface WidgetStrings {
  inputPlaceholder: string;
  send: string;
  closeChat: string;
  openChat: string;
  downloadTranscript: string;
  goodAnswer: string;
  badAnswer: string;
  poweredBy: string;
  consentAccept: string;
  consentDecline: string;
  consentUnavailable: string;
  consentChangeMind: string;
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  leadSend: string;
  leadSkip: string;
  agentLabel: string;
  source: string;
  sourceN: (n: number) => string;
  connectingToTeam: string;
  emailTranscript: string;
  emailTranscriptPlaceholder: string;
  emailTranscriptSend: string;
  emailTranscriptSent: string;
  emailTranscriptFailed: string;
}

const EN: WidgetStrings = {
  inputPlaceholder: "Type a message…",
  send: "Send",
  closeChat: "Close chat",
  openChat: "Open chat",
  downloadTranscript: "Download transcript",
  goodAnswer: "Good answer",
  badAnswer: "Bad answer",
  poweredBy: "Powered by SanchiJawab",
  consentAccept: "Accept",
  consentDecline: "Decline",
  consentUnavailable: "Chat is unavailable until consent is given.",
  consentChangeMind: "Change your mind?",
  leadName: "Name",
  leadEmail: "Email",
  leadPhone: "Phone (optional)",
  leadSend: "Send",
  leadSkip: "No thanks",
  agentLabel: "Agent",
  source: "Source",
  sourceN: (n) => `Source ${n}`,
  connectingToTeam: "Connecting you with our team — someone will be with you shortly.",
  emailTranscript: "Email transcript",
  emailTranscriptPlaceholder: "Your email address",
  emailTranscriptSend: "Send",
  emailTranscriptSent: "Sent! Check your inbox.",
  emailTranscriptFailed: "Couldn't send that — try again?",
};

// Widget UI chrome only (FR-W8) — the bot's own answers already reply in
// the visitor's detected language (FR-C6) regardless of this setting;
// this covers the fixed labels/placeholders around that answer.
const HI: WidgetStrings = {
  inputPlaceholder: "संदेश लिखें…",
  send: "भेजें",
  closeChat: "चैट बंद करें",
  openChat: "चैट खोलें",
  downloadTranscript: "बातचीत डाउनलोड करें",
  goodAnswer: "अच्छा जवाब",
  badAnswer: "खराब जवाब",
  poweredBy: "Powered by SanchiJawab",
  consentAccept: "स्वीकार करें",
  consentDecline: "अस्वीकार करें",
  consentUnavailable: "सहमति दिए बिना चैट उपलब्ध नहीं है।",
  consentChangeMind: "विचार बदलें?",
  leadName: "नाम",
  leadEmail: "ईमेल",
  leadPhone: "फ़ोन (वैकल्पिक)",
  leadSend: "भेजें",
  leadSkip: "नहीं धन्यवाद",
  agentLabel: "एजेंट",
  source: "स्रोत",
  sourceN: (n) => `स्रोत ${n}`,
  connectingToTeam: "आपको हमारी टीम से जोड़ा जा रहा है — कोई जल्द ही आपसे संपर्क करेगा।",
  emailTranscript: "बातचीत ईमेल करें",
  emailTranscriptPlaceholder: "आपका ईमेल पता",
  emailTranscriptSend: "भेजें",
  emailTranscriptSent: "भेज दिया! अपना इनबॉक्स देखें।",
  emailTranscriptFailed: "भेज नहीं सके — फिर कोशिश करें?",
};

const LOCALES: Record<string, WidgetStrings> = { en: EN, hi: HI };

export function stringsFor(locale: string | undefined): WidgetStrings {
  const key = (locale || "en").toLowerCase().split("-")[0];
  return LOCALES[key] || EN;
}
