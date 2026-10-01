import type { Metadata } from "next";
import { SolutionTemplate } from "@/components/marketing/solutions/solution-template";

export const metadata: Metadata = {
  title: "SanchiJawab for Education",
  description: "Answer admissions and course questions instantly, in the language applicants actually write in.",
};

export default function EducationSolutionPage() {
  return (
    <SolutionTemplate
      content={{
        badge: "Education",
        title: "Admissions questions answered at 2am",
        subtitle: "Indexed from your programs, deadlines, fees, and scholarship pages — and multilingual by default, so international and local applicants both get a straight answer.",
        painPoints: [
          "What's the application deadline for this program?",
          "Am I eligible for the merit scholarship?",
          "What documents do I need to submit?",
          "Is there a hostel for first-year students?",
        ],
        helps: [
          { title: "Always-on admissions desk", body: "Programs, deadlines, fees, and eligibility criteria answered instantly, any hour, in the applicant's own language." },
          { title: "Complex cases still reach a human", body: "Transfer credits, visa questions, and anything genuinely case-specific routes straight to your admissions office." },
          { title: "One crawl covers every department", body: "A single index spans your whole site, so a prospective student doesn't need to know which department's page to search." },
        ],
        stat: { value: "300+", label: "repetitive admissions emails deflected per week, typical season" },
        quote: {
          body: "Admissions season used to mean 300 identical emails a week. Now the widget handles deadlines and fee questions, and our team only sees the genuinely hard cases.",
          name: "Dr. Leela Krishnan",
          role: "Admissions Director, JECRC Foundation",
        },
      }}
    />
  );
}
