import { LegalTemplate, type LegalSection } from "@/components/marketing/legal/legal-template";
import { fetchContent, parseSections } from "@/lib/content";

// A legal page whose text a super admin can replace from the dashboard.
// `sections`/`updated` are the built-in copy, used until something is published.
export async function CmsLegal({
  slug, title, updated, sections,
}: { slug: string; title: string; updated: string; sections: LegalSection[] }) {
  const cms = await fetchContent("legal", slug);
  if (!cms) return <LegalTemplate title={title} updated={updated} sections={sections} />;
  return (
    <LegalTemplate
      title={cms.title}
      updated={cms.date ? new Date(cms.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : updated}
      sections={parseSections(cms.body ?? "")}
    />
  );
}
