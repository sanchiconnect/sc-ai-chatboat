"use client";

import { useState } from "react";
import { Mail, MessageSquare } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await api.submitContact(form);
      setResult({
        kind: "success",
        text: res.email_sent
          ? "Sent — we'll get back to you within a business day."
          : "Received — email delivery isn't configured in this environment yet, but your message was logged.",
      });
      setForm({ name: "", email: "", company: "", message: "" });
    } catch (err) {
      setResult({ kind: "error", text: err instanceof ApiError ? err.message : "Couldn't send that — try again in a moment." });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-dot-grid py-16 text-center md:py-20">
          <div className="container">
            <h1 className="font-display mx-auto max-w-[20ch] text-[36px] font-semibold tracking-tight text-fg sm:text-[46px]">
              Talk to us
            </h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] text-fg-muted">
              Questions about pricing, a custom plan, or whether SanchiJawab fits your site — a real person
              reads every message here.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="container grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.3fr]">
            <div className="flex flex-col gap-4">
              <Card className="flex items-start gap-3 p-5">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" />
                <div>
                  <h3 className="text-[14.5px] font-semibold text-fg">Email</h3>
                  <p className="mt-1 text-[13.5px] text-fg-muted">support@sanchijawab.com</p>
                </div>
              </Card>
              <Card className="flex items-start gap-3 p-5">
                <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" />
                <div>
                  <h3 className="text-[14.5px] font-semibold text-fg">In the product</h3>
                  <p className="mt-1 text-[13.5px] text-fg-muted">
                    Already a customer? Ask your own bot a question in the dashboard Playground — it&apos;s the
                    fastest way to reach us about something specific to your account.
                  </p>
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <input
                    required
                    placeholder="Your name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="border border-border bg-surface-2 rounded-lg px-3 py-2.5 text-[13.5px]"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Work email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="border border-border bg-surface-2 rounded-lg px-3 py-2.5 text-[13.5px]"
                  />
                </div>
                <input
                  placeholder="Company (optional)"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="border border-border bg-surface-2 rounded-lg px-3 py-2.5 text-[13.5px]"
                />
                <textarea
                  required
                  placeholder="What can we help with?"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="h-32 border border-border bg-surface-2 rounded-lg px-3 py-2.5 text-[13.5px] resize-y"
                />
                {result && (
                  <div
                    className={`text-[13px] rounded-lg p-3 ${
                      result.kind === "success" ? "text-success bg-success-soft" : "text-danger bg-danger-soft"
                    }`}
                  >
                    {result.text}
                  </div>
                )}
                <Button type="submit" variant="warm" disabled={sending} className="w-fit">
                  {sending ? "Sending…" : "Send message"}
                </Button>
              </form>
            </Card>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
