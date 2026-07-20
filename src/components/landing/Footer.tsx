const LINKS = {
  Product: ["Features", "Pricing", "Changelog", "Docs"],
  Company: ["About", "Blog", "Careers", "Contact"],
  Legal: ["Privacy", "Terms", "Security"],
};

export function Footer() {
  return (
    <footer className="border-t border-jalebi-border py-16 px-6">
      <div className="max-w-[1100px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <span className="text-lg font-semibold text-jalebi-accent tracking-tight font-display">
            Jalebi
          </span>
          <p className="text-xs text-jalebi-border-strong mt-2">
            AI-powered video editing.
          </p>
        </div>

        {Object.entries(LINKS).map(([group, links]) => (
          <div key={group}>
            <h4 className="text-xs font-semibold text-jalebi-border-strong uppercase tracking-wider mb-3">
              {group}
            </h4>
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link}>
                  <a
                    href="#"
                    className="text-sm text-jalebi-border-strong hover:text-white transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jalebi-accent focus-visible:ring-offset-2 focus-visible:ring-offset-jalebi-bg rounded-sm"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="max-w-[1100px] mx-auto mt-16 pt-8 border-t border-jalebi-border flex items-center justify-between">
        <p className="text-xs text-jalebi-border-strong">
          © 2026 Jalebi. All rights reserved.
        </p>
        <div className="flex items-center gap-4">
          {["X", "GH", "DC"].map((icon) => (
            <a
              key={icon}
              href="#"
              className="w-8 h-8 rounded-full bg-jalebi-surface border border-jalebi-border flex items-center justify-center text-xs text-jalebi-border-strong hover:text-white hover:border-jalebi-border-strong transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jalebi-accent focus-visible:ring-offset-2 focus-visible:ring-offset-jalebi-bg"
            >
              {icon}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
