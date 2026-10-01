import type { Metadata } from "next";
import { LegalTemplate } from "@/components/marketing/legal/legal-template";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalTemplate
      title="Terms of Service"
      updated="October 1, 2026"
      sections={[
        {
          heading: "The service",
          body: [
            "SanchiJawab crawls content you authorize, indexes it, and answers questions from visitors to your website through an embeddable widget. You're responsible for having the right to crawl and index any content you point us at.",
          ],
        },
        {
          heading: "Your account",
          body: [
            "You're responsible for activity under your workspace, including actions taken by teammates you invite. Keep your password secure and tell us promptly if you suspect unauthorized access.",
          ],
        },
        {
          heading: "Acceptable use",
          body: [
            "Don't use SanchiJawab to crawl or index content you don't have the right to use, to deceive visitors about who or what they're talking to, or to collect personal information from visitors beyond what's needed to answer their question or route a lead.",
          ],
        },
        {
          heading: "Plans and billing",
          body: [
            "Paid plans are billed monthly in advance via Razorpay or Stripe. You can change or cancel a plan at any time from your dashboard; changes take effect on your next billing cycle.",
          ],
        },
        {
          heading: "Termination",
          body: [
            "We may suspend a bot or workspace that violates these terms, abuses the service, or is used for crawling/content that infringes someone else's rights. You can delete your bots, sources, or workspace at any time.",
          ],
        },
        {
          heading: "Limitation of liability",
          body: [
            "SanchiJawab is provided \"as is.\" We don't guarantee an AI-generated answer is always accurate or complete — that's exactly why every answer carries a citation back to its source, so you and your visitors can verify it yourselves.",
          ],
        },
        {
          heading: "Contact",
          body: ["Questions about these terms: support@sanchijawab.com."],
        },
      ]}
    />
  );
}
