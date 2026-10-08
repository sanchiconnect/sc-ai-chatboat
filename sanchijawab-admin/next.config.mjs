// Security headers (SAN-1126 / SAN-1792).
//
// The Content-Security-Policy is built from the same public URLs the site is built with, and ships in REPORT-ONLY
// mode by default: the browser logs anything it would have blocked (open the browser console on the live site and
// check checkout) but breaks nothing. Once a real deployment has been clicked through with no reports, build with
// CSP_ENFORCE=true to turn it into a blocking policy. It is not sent in development (Next's dev server needs eval).
const isProd = process.env.NODE_ENV === "production";

const origin = (value, fallback) => {
  try {
    return new URL(value || fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
};
const apiOrigin = origin(process.env.NEXT_PUBLIC_API_URL, "http://localhost:8000");

// Payment pages load Razorpay's and Stripe's own scripts and frames.
const payments = {
  script: ["https://checkout.razorpay.com", "https://js.stripe.com"],
  connect: ["https://api.razorpay.com", "https://lumberjack.razorpay.com", "https://api.stripe.com"],
  frame: ["https://api.razorpay.com", "https://checkout.razorpay.com", "https://js.stripe.com", "https://hooks.stripe.com"],
};

const csp = [
  "default-src 'self'",
  // Next.js injects small inline scripts to start up; a nonce-based policy would be stricter but needs middleware.
  `script-src 'self' 'unsafe-inline' ${payments.script.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  // Product pictures and logos can come from any https site the customer chooses.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${payments.connect.join(" ")}`,
  `frame-src ${payments.frame.join(" ")}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera/mic/location are never used by the site or dashboard.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Stops other sites framing the dashboard (clickjacking). The widget is a separate script on customers' pages.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  ...(isProd
    ? [
        // Only meaningful over HTTPS, so production builds only.
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        {
          key: process.env.CSP_ENFORCE === "true" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
          value: csp,
        },
      ]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
