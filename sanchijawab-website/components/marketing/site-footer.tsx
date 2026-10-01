import Link from "next/link";
import { Github, Linkedin, Twitter } from "lucide-react";
import { Logo } from "@/components/marketing/logo";
import { footerNav, siteConfig } from "@/lib/config/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface-2">
      <div className="container grid grid-cols-2 gap-10 py-14 sm:grid-cols-2 md:grid-cols-6">
        <div className="col-span-2 flex flex-col gap-4">
          <Logo />
          <p className="max-w-[26ch] text-[14px] leading-relaxed text-fg-muted">{siteConfig.description}</p>
          <div className="flex items-center gap-3 pt-1">
            {[
              { icon: Twitter, href: "https://twitter.com/sanchiconnect", label: "Twitter" },
              { icon: Linkedin, href: "https://linkedin.com/company/sanchiconnect", label: "LinkedIn" },
              { icon: Github, href: "https://github.com/sanchiconnect", label: "GitHub" },
            ].map(({ icon: Icon, href, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-fg-muted transition-colors hover:border-accent hover:text-accent-ink"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        {footerNav.map((group) => (
          <div key={group.heading} className="flex flex-col gap-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-fg-faint">{group.heading}</p>
            <ul className="flex flex-col gap-2.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[14px] text-fg-muted transition-colors hover:text-accent-ink">
                    {link.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-3 py-6 text-[13px] text-fg-faint sm:flex-row">
          <p>© {new Date().getFullYear()} Sanchiconnect Technologies. All rights reserved.</p>
          <p>Built in India, answering the world.</p>
        </div>
      </div>
    </footer>
  );
}
