// Super-admin-editable marketing content (legal pages + blog). The website
// renders published rows from the API and falls back to the built-in copy
// when none exists or the API is unreachable, so the site never goes blank.
import { blogPosts, type BlogPost } from "@/lib/blog-posts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface CmsItem {
  kind: string;
  slug: string;
  title: string;
  excerpt: string;
  read_minutes: number;
  published: boolean;
  date: string;
  body?: string;
}

export interface Section {
  heading: string;
  body: string[];
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 60 } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export const fetchContent = (kind: string, slug: string) => getJson<CmsItem>(`/public/content/${kind}/${slug}`);

export function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

// "## Heading" starts a section; blank-line separated paragraphs follow it.
export function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const block of paragraphs(text)) {
    const m = block.match(/^##\s+(.+?)(?:\n([\s\S]*))?$/);
    if (m) {
      current = { heading: m[1].trim(), body: m[2] ? paragraphs(m[2]) : [] };
      sections.push(current);
    } else {
      if (!current) {
        current = { heading: "", body: [] };
        sections.push(current);
      }
      current.body.push(block);
    }
  }
  return sections;
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const cms = await fetchContent("blog", slug);
  if (cms) {
    return {
      slug: cms.slug,
      title: cms.title,
      excerpt: cms.excerpt,
      date: cms.date || new Date().toISOString().slice(0, 10),
      readMinutes: cms.read_minutes,
      body: paragraphs(cms.body ?? ""),
    };
  }
  return blogPosts.find((p) => p.slug === slug) ?? null;
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  const cms = (await getJson<CmsItem[]>("/public/content/blog")) ?? [];
  const fromCms: BlogPost[] = cms.map((c) => ({
    slug: c.slug,
    title: c.title,
    excerpt: c.excerpt,
    date: c.date || "1970-01-01",
    readMinutes: c.read_minutes,
    body: [],
  }));
  const cmsSlugs = new Set(fromCms.map((p) => p.slug));
  return [...fromCms, ...blogPosts.filter((p) => !cmsSlugs.has(p.slug))].sort((a, b) => b.date.localeCompare(a.date));
}
