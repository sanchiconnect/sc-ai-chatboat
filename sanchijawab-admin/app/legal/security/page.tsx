import type { Metadata } from "next";
import { CmsLegal } from "@/components/marketing/legal/cms-legal";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <CmsLegal slug="security"
      title="Security"
      updated="October 1, 2026"
      sections={[
        {
          heading: "Workspace isolation",
          body: [
            "Every workspace's indexed content, conversations, and embeddings are logically scoped to that workspace alone — queries can't cross workspace boundaries.",
          ],
        },
        {
          heading: "Credential encryption",
          body: [
            "Payment gateway credentials and other secrets are encrypted at rest and are never sent back to the browser once saved — the dashboard only ever shows whether a credential is configured, not its value.",
          ],
        },
        {
          heading: "Access control",
          body: [
            "Role-based access within your workspace (Owner, Admin, Agent, Viewer) controls who can manage bots, billing, and team membership. Platform staff access is limited to support-level visibility and is logged.",
          ],
        },
        {
          heading: "Payments",
          body: [
            "Checkout is handled by Razorpay or Stripe directly — we never store your card details. Every payment is independently re-verified server-side against the gateway before an order is marked paid; a client-side success callback is never trusted on its own.",
          ],
        },
        {
          heading: "Reporting a vulnerability",
          body: [
            "If you believe you've found a security issue, email security@sanchijawab.com with details. We ask that you avoid accessing or modifying other customers' data while investigating.",
          ],
        },
      ]}
    />
  );
}
