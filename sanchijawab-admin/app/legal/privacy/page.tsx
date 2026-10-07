import type { Metadata } from "next";
import { CmsLegal } from "@/components/marketing/legal/cms-legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <CmsLegal slug="privacy"
      title="Privacy Policy"
      updated="October 1, 2026"
      sections={[
        {
          heading: "What we collect",
          body: [
            "Account information you provide directly: name, email, and workspace details. Content you choose to index: the pages we crawl from your site, and any files you upload. Conversation data generated when a visitor uses your widget, including messages and any contact details a visitor shares.",
          ],
        },
        {
          heading: "How we use it",
          body: [
            "To operate the service: crawling your content, generating embeddings, and answering visitor questions. To improve reliability and detect abuse. We do not use your indexed content or conversation data to train any shared or third-party model.",
          ],
        },
        {
          heading: "Where it's stored",
          body: [
            "In a workspace-scoped index on infrastructure we control. Each workspace's content is logically isolated from every other workspace's.",
          ],
        },
        {
          heading: "Who can see it",
          body: [
            "Members of your own workspace, according to their role. Platform staff have support-level access to usage figures and team rosters to help with billing or technical issues, but do not access conversation transcripts or indexed content without your explicit permission.",
          ],
        },
        {
          heading: "Your rights",
          body: [
            "You can request export or deletion of your workspace's data by contacting support. Deleting a bot or source removes its indexed content and associated conversation history.",
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
