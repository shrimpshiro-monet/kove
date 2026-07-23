import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { TryItNow } from "@/components/landing/TryItNow";
import { SocialProofMarquee } from "@/components/landing/SocialProofMarquee";
import { FeatureSplit } from "@/components/landing/FeatureSplit";
import { Pricing } from "@/components/landing/Pricing";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/landing")({
  component: LandingPage,
});

export function LandingPage() {
  return (
    <div className="min-h-screen bg-jalebi-bg text-white">
      <Nav />
      <main>
        <Hero />
        <TryItNow />
        <SocialProofMarquee />
        <FeatureSplit />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
