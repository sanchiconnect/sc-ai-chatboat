import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Hero } from "@/components/marketing/home/hero";
import { LogoCloud } from "@/components/marketing/home/logo-cloud";
import { Stats } from "@/components/marketing/home/stats";
import { HowItWorks } from "@/components/marketing/home/how-it-works";
import { Features } from "@/components/marketing/home/features";
import { UseCases } from "@/components/marketing/home/use-cases";
import { Integrations } from "@/components/marketing/home/integrations";
import { DemoTeaser } from "@/components/marketing/home/demo-teaser";
import { Testimonials } from "@/components/marketing/home/testimonials";
import { PricingTeaser } from "@/components/marketing/home/pricing-teaser";
import { Comparison } from "@/components/marketing/home/comparison";
import { Faq } from "@/components/marketing/home/faq";
import { FinalCta } from "@/components/marketing/home/final-cta";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <LogoCloud />
        <Stats />
        <HowItWorks />
        <Features />
        <UseCases />
        <Integrations />
        <DemoTeaser />
        <Testimonials />
        <PricingTeaser />
        <Comparison />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
