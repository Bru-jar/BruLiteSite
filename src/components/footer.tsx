import Link from "next/link";
import { MatrixBrand } from "@/components/nav";

const groups = [
  {
    title: "Product",
    links: [
      { href: "/plugins", label: "Plugins" },
      { href: "/pricing", label: "Pricing" },
      { href: "/faq", label: "FAQ" },
      { href: "/beta", label: "Beta access" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/support", label: "Open a ticket" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/8">
      <div className="site-container py-12">
        <div className="grid gap-10 sm:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <MatrixBrand />
            <p className="mt-3 max-w-xs text-sm text-muted">
              A fast, plugin-powered client for Old School RuneScape. Not
              affiliated with Jagex Ltd.
            </p>
          </div>
          {groups.map((g) => (
            <div key={g.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
                {g.title}
              </p>
              <ul className="mt-3 space-y-2">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      prefetch={l.href === "/beta" ? false : undefined}
                      className="text-sm text-muted transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 border-t border-white/5 pt-6 text-sm text-muted">
          © {new Date().getFullYear()} Matrix. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
