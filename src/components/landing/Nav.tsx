import { useState, useEffect } from "react";
import { JalebiLogo } from "./JalebiLogo";

const LINKS = [
  { label: "Features", href: "#features" },
  { label: "Timeline", href: "#timeline" },
  { label: "Pricing", href: "#pricing" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 h-[72px] flex items-center justify-between px-6 md:px-12 transition-all duration-150 ${
        scrolled
          ? "bg-jalebi-bg/80 backdrop-blur-xl border-b border-jalebi-border"
          : "bg-transparent"
      }`}
    >
      {/* Logo */}
      <a href="/" className="text-jalebi-accent">
        <JalebiLogo />
      </a>

      {/* Nav links */}
      <nav className="hidden md:flex items-center gap-8">
        {LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-sm text-jalebi-border-strong hover:text-white transition-colors duration-150"
          >
            {link.label}
          </a>
        ))}
      </nav>

      {/* CTAs */}
      <div className="flex items-center gap-3">
        <a
          href="/sign-in"
          className="text-sm px-4 py-2 rounded-full text-jalebi-border-strong hover:text-white transition-colors duration-150"
        >
          Log in
        </a>
        <a
          href="/sign-up"
          className="text-sm px-5 py-2 rounded-full bg-jalebi-accent text-jalebi-bg font-semibold hover:bg-jalebi-accent-hover transition-colors duration-120"
        >
          Get started
        </a>
      </div>
    </header>
  );
}
