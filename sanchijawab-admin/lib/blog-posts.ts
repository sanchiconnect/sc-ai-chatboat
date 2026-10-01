export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readMinutes: number;
  body: string[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: "introducing-sanchijawab",
    title: "Introducing SanchiJawab",
    excerpt: "Why we built an AI assistant that only answers from what you've actually published.",
    date: "2026-09-02",
    readMinutes: 4,
    body: [
      "Most businesses already have the answer to their most common support question published somewhere on their own website — a returns policy, a pricing page, a course deadline. The problem was never a lack of information. It was that visitors couldn't find it fast enough, and support teams were tired of typing the same sentence for the hundredth time.",
      "SanchiJawab crawls a site, indexes it, and answers from it — nothing more. We deliberately didn't build a general-purpose chatbot that can talk about anything. If a visitor asks something outside what you've published, the bot says so and offers a human instead of guessing. That restraint is the whole point: an answer with a citation is worth more than a confident-sounding one without.",
      "We're starting with e-commerce, SaaS docs, education admissions, and real estate listings — four categories where the same handful of questions account for most support volume. If that sounds like your business, the free tier takes about fifteen minutes to set up.",
    ],
  },
  {
    slug: "how-breadth-first-crawling-works",
    title: "How our crawler actually works (and why depth-first wasn't enough)",
    excerpt: "The difference between a crawler that finds five pages and one that finds five hundred.",
    date: "2026-09-18",
    readMinutes: 6,
    body: [
      "Early in building SanchiJawab, our crawler only ever indexed a handful of pages per site — even on domains with thousands of pages. The bug was structural: it followed links depth-first from the seed page, so it would wander deep into one navigation branch before ever coming back to index the rest of the site.",
      "The fix was a proper breadth-first frontier: a queue of URLs to visit, and a single visited-set shared across the whole crawl, so every page at depth 1 gets indexed before the crawler moves on to depth 2. It sounds obvious in hindsight, but the difference between a crawler that finds five pages and one that finds five hundred is exactly this detail.",
      "We also respect robots.txt and your sitemap.xml if one exists, since a sitemap is usually a more complete and more intentional map of a site than whatever a crawler can discover by following links alone. Pages you've explicitly excluded stay excluded.",
      "The practical result: a typical site under 2,000 pages finishes a full crawl in under ten minutes, and the bot's knowledge actually reflects your whole site — not just whatever happened to be linked from the homepage.",
    ],
  },
  {
    slug: "what-makes-an-answer-trustworthy",
    title: "What makes an AI answer trustworthy",
    excerpt: "It's not the model. It's whether you can check the answer yourself.",
    date: "2026-09-25",
    readMinutes: 5,
    body: [
      "Ask most AI chat products how they decide what's true, and the honest answer is: they don't, really. A large language model generates the most statistically likely continuation of a conversation, which is a very different thing from generating a verified fact.",
      "SanchiJawab's answers are grounded in retrieval: before the model writes a word, we search your indexed content for the passages most relevant to the question, and the model is instructed to answer only from those passages. Every answer carries a citation back to the specific page or document it came from.",
      "This has a consequence some teams find surprising at first: sometimes the bot says it doesn't know. If nothing relevant turns up in the retrieval step, there's nothing grounded to answer from — and we'd rather the bot admit that and offer a human than fill the gap with something plausible-sounding and wrong.",
      "That's the trade we're making on purpose. A support bot that's occasionally unhelpful but never misleading is more valuable, long-term, than one that always has something confident to say.",
    ],
  },
];
