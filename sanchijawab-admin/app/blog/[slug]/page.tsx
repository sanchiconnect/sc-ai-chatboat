import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { blogPosts } from "@/lib/blog-posts";

export function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = blogPosts.find((p) => p.slug === params.slug);
  if (!post) return {};
  return { title: post.title, description: post.excerpt };
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = blogPosts.find((p) => p.slug === params.slug);
  if (!post) notFound();

  return (
    <>
      <SiteHeader />
      <main>
        <article className="py-16">
          <div className="container max-w-2xl">
            <Link href="/blog" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg">
              <ArrowLeft className="h-3.5 w-3.5" /> All posts
            </Link>
            <p className="mt-6 text-[12.5px] font-semibold text-fg-faint">
              {new Date(post.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              {" · "}
              {post.readMinutes} min read
            </p>
            <h1 className="font-display mt-2 text-[32px] font-semibold tracking-tight text-fg sm:text-[38px]">
              {post.title}
            </h1>
            <div className="mt-8 flex flex-col gap-5">
              {post.body.map((para, i) => (
                <p key={i} className="text-[16px] leading-relaxed text-fg-muted">
                  {para}
                </p>
              ))}
            </div>
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
