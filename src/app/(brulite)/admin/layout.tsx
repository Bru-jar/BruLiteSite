import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import type { ReactNode } from "react";

const adminLinks = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/tickets", label: "Tickets" },
  { href: "/admin/plugins", label: "Plugins" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/releases", label: "Releases" },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminPage();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap gap-2">
        {adminLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:border-primary/60 hover:text-foreground"
          >
            {l.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
