import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Card } from "@/components/ui/card";
import { blogPosts } from "@/lib/blog-posts";

export const metadata: Metadata = {
  title: "Blog",
  description: "Notes on building SanchiJawab — crawling, retrieval, and what makes an AI answer trustworthy.",
};

export default function BlogIndexPage() {
  const posts = [...blogPosts].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-dot-grid py-16 text-center md:py-20">
          <div className="container">
            <h1 className="font-display mx-auto max-w-[20ch] text-[36px] font-semibold tracking-tight text-fg sm:text-[46px]">
              From the team
            </h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] text-fg-muted">
              Notes on building SanchiJawab — the engineering, the product decisions, and why we made them.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="container grid grid-cols-1 gap-5 md:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`}>
                <Card className="flex h-full flex-col gap-3 p-6 hover:border-accent">
                  <p className="text-[12px] font-semibold text-fg-faint">
                    {new Date(post.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}
                    {post.readMinutes} min read
                  </p>
                  <h2 className="font-display text-[18px] font-semibold text-fg">{post.title}</h2>
                  <p className="flex-1 text-[14px] leading-relaxed text-fg-muted">{post.excerpt}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
