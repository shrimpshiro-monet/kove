import { useScrollReveal } from "./shared/useScrollReveal";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["5 exports/mo", "720p render", "Basic AI cuts", "Community support"],
    cta: "Get started",
    featured: false,
  },
  {
    name: "Flux",
    price: "$19",
    period: "/mo",
    features: ["Unlimited exports", "4K render", "Advanced AI effects", "Priority support", "Custom branding"],
    cta: "Start free trial",
    featured: true,
  },
  {
    name: "Nova",
    price: "$49",
    period: "/mo",
    features: ["Everything in Flux", "Team collaboration", "API access", "Dedicated support", "SLA guarantee", "Earn up to 30% on referrals"],
    cta: "Contact sales",
    featured: false,
  },
];

export function Pricing() {
  const ref = useScrollReveal();

  return (
    <section id="pricing" ref={ref} className="reveal py-32 px-6">
      <div className="max-w-[1100px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white font-display mb-4">
            Simple pricing
          </h2>
          <p className="text-jalebi-border-strong">
            Start free. Upgrade when you need more.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-2xl p-8 flex flex-col ${
                tier.name === "Nova"
                  ? "bg-jalebi-surface border-[1.5px] border-jalebi-accent relative"
                  : "bg-jalebi-surface border border-jalebi-border"
              }`}
            >
              {tier.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-jalebi-accent text-jalebi-bg text-xs font-semibold px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}

              <h3 className="text-lg font-semibold text-white mb-2">{tier.name}</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-bold text-white">{tier.price}</span>
                <span className="text-sm text-jalebi-border-strong">{tier.period}</span>
              </div>

              <ul className="space-y-3 flex-1 mb-8">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-jalebi-border-strong">
                    <span className="text-jalebi-accent mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href="/sign-up"
                className={`w-full py-3 rounded-full text-sm font-semibold text-center transition-colors duration-120 ${
                  tier.name === "Nova"
                    ? "bg-jalebi-accent text-jalebi-bg hover:bg-jalebi-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jalebi-accent focus-visible:ring-offset-2 focus-visible:ring-offset-jalebi-bg"
                    : "border border-jalebi-border text-white hover:border-jalebi-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jalebi-accent focus-visible:ring-offset-2 focus-visible:ring-offset-jalebi-bg"
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
