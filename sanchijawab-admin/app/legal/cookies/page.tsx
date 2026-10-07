import type { Metadata } from "next";
import { CmsLegal } from "@/components/marketing/legal/cms-legal";

export const metadata: Metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return (
    <CmsLegal slug="cookies"
      title="Cookie Policy"
      updated="October 1, 2026"
      sections={[
        {
          heading: "What we use cookies for",
          body: [
            "Keeping you signed in to your dashboard session, and remembering your light/dark theme preference. We don't use third-party advertising or cross-site tracking cookies on this site or in the embeddable widget.",
          ],
        },
        {
          heading: "On your own site (the widget)",
          body: [
            "The embeddable widget may set a short-lived identifier in the visitor's browser so a conversation can continue across page loads on your site. It doesn't track visitors across other, unrelated websites.",
          ],
        },
        {
          heading: "Managing cookies",
          body: [
            "Most browsers let you block or delete cookies through their settings. Blocking essential cookies may prevent the dashboard from keeping you signed in.",
          ],
        },
        {
          heading: "Contact",
          body: ["Questions about this policy: support@sanchijawab.com."],
        },
      ]}
    />
  );
}
