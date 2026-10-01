export const siteConfig = {
  name: "SanchiJawab",
  tagline: "Your website, turned into an answer engine.",
  description:
    "SanchiJawab crawls your site and docs, then gives every visitor instant, cited answers — in a chat widget you can ship in an afternoon.",
  url: "https://sanchijawab.com",
};

export const mainNav = [
  {
    label: "Product",
    items: [
      { title: "Features", href: "/features", description: "Crawling, retrieval, citations, handoff." },
      { title: "How it works", href: "/how-it-works", description: "From URL to live widget in four steps." },
      { title: "Integrations", href: "/integrations", description: "Slack, Zendesk, HubSpot, and 20+ more." },
      { title: "Demo", href: "/demo", description: "Try SanchiJawab on a sample site right now." },
    ],
  },
  {
    label: "Solutions",
    items: [
      { title: "E-commerce", href: "/solutions/ecommerce", description: "Cut support tickets on order status and sizing." },
      { title: "SaaS", href: "/solutions/saas", description: "Deflect docs questions before they hit your inbox." },
      { title: "Education", href: "/solutions/education", description: "Answer admissions and course FAQs instantly." },
      { title: "Real estate", href: "/solutions/real-estate", description: "Qualify leads while agents are offline." },
      { title: "Agencies", href: "/solutions/agencies", description: "White-label SanchiJawab across client sites." },
    ],
  },
  { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
] as const;

export const footerNav = [
  {
    heading: "Product",
    links: [
      { title: "Features", href: "/features" },
      { title: "How it works", href: "/how-it-works" },
      { title: "Integrations", href: "/integrations" },
      { title: "Pricing", href: "/pricing" },
      { title: "Demo", href: "/demo" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { title: "E-commerce", href: "/solutions/ecommerce" },
      { title: "SaaS", href: "/solutions/saas" },
      { title: "Education", href: "/solutions/education" },
      { title: "Real estate", href: "/solutions/real-estate" },
      { title: "Agencies", href: "/solutions/agencies" },
    ],
  },
  {
    heading: "Company",
    links: [
      { title: "About", href: "/about" },
      { title: "Contact", href: "/contact" },
      { title: "Blog", href: "/blog" },
      { title: "Changelog", href: "/changelog" },
      { title: "Help center", href: "/help" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { title: "Privacy policy", href: "/legal/privacy" },
      { title: "Terms of service", href: "/legal/terms" },
      { title: "Cookie policy", href: "/legal/cookies" },
      { title: "Data processing", href: "/legal/dpa" },
      { title: "Security", href: "/legal/security" },
    ],
  },
] as const;
