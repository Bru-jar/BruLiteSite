import Link from "next/link";
import Image from "next/image";
import { asc, eq } from "drizzle-orm";
import {
  Zap,
  ShieldCheck,
  Puzzle,
  LifeBuoy,
  ArrowRight,
  LogIn,
  CreditCard,
  Download,
  Check,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { DiscordMark } from "@/components/nav";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { plugins } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const features = [
  {
    icon: Zap,
    title: "Built for speed",
    body: "A lightweight client tuned for smooth gameplay — low overhead, fast startup, GPU-accelerated.",
  },
  {
    icon: Puzzle,
    title: "Powerful plugins",
    body: "Quality-of-life and automation plugins maintained by the BruLite team, all included with membership.",
  },
  {
    icon: ShieldCheck,
    title: "Account-first security",
    body: "Sign in with Discord. Your membership is verified through our secure API — nothing sensitive lives in the client.",
  },
  {
    icon: LifeBuoy,
    title: "Real support",
    body: "File bugs and feature requests directly from the site. Our team triages everything through Discord.",
  },
];

const steps = [
  {
    icon: LogIn,
    title: "Sign in with Discord",
    body: "One click — you're added to the BruLite server automatically.",
  },
  {
    icon: CreditCard,
    title: "Choose a plan",
    body: "Monthly or yearly membership, billed securely through Stripe.",
  },
  {
    icon: Download,
    title: "Download & play",
    body: "Grab the client, link it from your browser, and you're in game.",
  },
];

const trust = ["Discord login", "Instant access", "Cancel anytime"];

export default async function Home() {
  const [session, featuredPlugins] = await Promise.all([
    getSession(),
    db
      .select()
      .from(plugins)
      .where(eq(plugins.published, true))
      .orderBy(asc(plugins.sortOrder), asc(plugins.name))
      .limit(3),
  ]);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-grid absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-6 sm:pt-28">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <Reveal>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Custom OSRS client
              </p>
              <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                Play Old School,
                <br />
                <span className="text-gradient">the BruLite way.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg text-muted">
                A fast, plugin-powered client for Old School RuneScape. Sign in
                with Discord, grab a membership, and you&apos;re in.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-primary-bright to-primary px-7 py-3.5 font-medium text-white shadow-xl shadow-primary/40 transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  Get BruLite <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/plugins"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface/60 px-7 py-3.5 font-medium backdrop-blur transition-colors hover:border-primary/50"
                >
                  Browse plugins
                </Link>
              </div>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
                {trust.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-accent" /> {t}
                  </span>
                ))}
                {session && (
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1 text-accent transition-colors hover:text-foreground"
                  >
                    Go to dashboard <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </Reveal>

            <Reveal delay={150} className="relative mx-auto w-full max-w-md">
              <div className="animate-aurora absolute -inset-10 rounded-[3rem] bg-gradient-to-tr from-primary/30 via-primary-bright/20 to-accent/30 blur-3xl" />
              <Image
                src="/logo.png"
                alt="BruLite"
                width={560}
                height={560}
                priority
                className="relative rounded-3xl ring-1 ring-white/15 shadow-2xl shadow-primary/30"
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-white/5 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Get started
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              In game in three steps
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 120}>
                <Card hover className="relative h-full">
                  <span className="absolute right-5 top-5 font-mono text-sm text-muted/40">
                    0{i + 1}
                  </span>
                  <div className="inline-flex rounded-lg bg-primary/15 p-2.5">
                    <s.icon className="h-5 w-5 text-accent" />
                  </div>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted">{s.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-white/5 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Why BruLite
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need, nothing you don&apos;t
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 100}>
                <Card hover className="h-full">
                  <div className="inline-flex rounded-lg bg-primary/15 p-2.5">
                    <f.icon className="h-5 w-5 text-accent" />
                  </div>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted">{f.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Plugin preview */}
      {featuredPlugins.length > 0 && (
        <section className="border-t border-white/5 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="flex items-end justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Plugins
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  Included with membership
                </h2>
              </div>
              <Link
                href="/plugins"
                className="hidden shrink-0 items-center gap-1.5 text-sm text-accent transition-colors hover:text-foreground sm:inline-flex"
              >
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </Reveal>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredPlugins.map((p, i) => (
                <Reveal key={p.id} delay={i * 100}>
                  <Card hover className="flex h-full flex-col">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="mb-4 aspect-video w-full rounded-lg object-cover ring-1 ring-white/10"
                      />
                    ) : (
                      <div className="mb-4 flex aspect-video w-full items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-surface-2 ring-1 ring-white/10">
                        <Puzzle className="h-8 w-8 text-accent/60" />
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold">{p.name}</h3>
                      <Badge tone="purple">{p.category}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted">
                      {p.description}
                    </p>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Community CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="gradient-border relative overflow-hidden rounded-3xl bg-surface/60 px-8 py-14 text-center sm:px-16">
              <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" />
              <DiscordMark className="relative mx-auto h-10 w-10 text-accent" />
              <h2 className="relative mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
                Join the BruLite community
              </h2>
              <p className="relative mx-auto mt-4 max-w-xl text-muted">
                Membership unlocks the client download, every plugin, and your
                Customer role on the BruLite Discord — where tickets, updates
                and support happen.
              </p>
              <Link
                href={session ? "/pricing" : "/api/auth/discord"}
                className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-primary-bright to-primary px-8 py-3.5 font-medium text-white shadow-xl shadow-primary/40 transition-all hover:brightness-110 active:scale-[0.98]"
              >
                {session ? "See pricing" : "Sign in with Discord"}{" "}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
