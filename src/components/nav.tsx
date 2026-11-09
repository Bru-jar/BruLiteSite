import Link from "next/link";
import Image from "next/image";
import { getSession, avatarUrl } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
import { NavLinks, type NavLink } from "@/components/nav-links";
import { MobileMenu } from "@/components/mobile-menu";
import { ArrowUpRight } from "lucide-react";

export function MatrixBrand() {
  return (
    <Link href="/" className="inline-flex w-fit items-center gap-2.5">
      <Image src="/matrix-windows-icon.webp" alt="" width={40} height={40} unoptimized />
      <span className="text-sm font-bold tracking-[.2em]">MATRIX</span>
    </Link>
  );
}

export async function SiteNav() {
  const session = await getSession();

  const links: NavLink[] = [
    { href: "/pricing", label: "Pricing" },
    { href: "/faq", label: "FAQ" },
    ...(session
      ? [
          { href: "/support", label: "Support" },
          ...(session.isAdmin
            ? [{ href: "/admin", label: "Admin", accent: true }]
            : []),
          { href: "/dashboard", label: "Dashboard" },
        ]
      : [{ href: "/auth/signin", label: "Account" }]),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-background/70 backdrop-blur-xl">
      <nav className="site-container relative flex h-16 items-center justify-between gap-3">
        <MatrixBrand />

        <div className="hidden items-center gap-7 md:flex">
          <NavLinks links={links} />
        </div>

        <div className="flex items-center gap-3">
          {session ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl(session.discordId, session.avatar)}
                alt=""
                width={30}
                height={30}
                className="rounded-full ring-1 ring-white/15"
              />
              <SignOutButton />
            </div>
          ) : null}
          <Link href="/beta" prefetch={false} className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-primary/20 sm:px-3">
            Beta access <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
          <MobileMenu links={links} />
        </div>
      </nav>
    </header>
  );
}

export function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  );
}
