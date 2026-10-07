import type { Metadata } from "next";
import { CmsLegal } from "@/components/marketing/legal/cms-legal";

export const metadata: Metadata = { title: "Data Processing Agreement" };

export default function DpaPage() {
  return (
    <CmsLegal slug="dpa"
      title="Data Processing Agreement"
      updated="October 1, 2026"
      sections={[
        {
          heading: "Roles",
          body: [
            "For data you index (your site content) and data your visitors submit through the widget, you are the data controller and Sanchiconnect Technologies acts as data processor, processing it only to provide the SanchiJawab service.",
          ],
        },
        {
          heading: "Scope of processing",
          body: [
            "Crawling and indexing content you authorize; storing and retrieving it to generate answers; storing conversation transcripts and any contact details a visitor voluntarily provides.",
          ],
        },
        {
          heading: "Sub-processors",
          body: [
            "We use infrastructure and email-delivery sub-processors necessary to operate the service. A current list is available on request to support@sanchijawab.com.",
          ],
        },
        {
          heading: "Security",
          body: [
            "Payment gateway credentials and other secrets are encrypted at rest. Each workspace's indexed content is logically isolated from every other workspace's.",
          ],
        },
        {
          heading: "Deletion",
          body: [
            "Deleting a bot, source, or workspace removes its data from active systems. Contact support for a full data-deletion request beyond standard in-product deletion.",
          ],
        },
        {
          heading: "Requesting a signed DPA",
          body: ["If your organization requires a formally executed DPA, contact support@sanchijawab.com."],
        },
      ]}
    />
  );
}
