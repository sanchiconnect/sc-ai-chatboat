// Baseline security headers (SAN-1126 / SAN-1792). A full Content-Security-Policy
// is deliberately NOT here yet: the checkout page loads Razorpay's script and the
// dev server needs inline scripts, so it has to be written and tested against the
// real production URLs once hosting exists (tracked in SAN-1792).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera/mic/location are never used by the site or dashboard.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Stops other sites framing the dashboard (clickjacking). The widget is a
  // separate script on customers' pages and is not affected.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Only meaningful over HTTPS, so production builds only.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
