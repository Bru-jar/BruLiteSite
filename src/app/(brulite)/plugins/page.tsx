import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { plugins } from "@/lib/db/schema";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Puzzle } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";

export const metadata = { title: "Plugins" };
export const dynamic = "force-dynamic";

export default async function PluginsPage({
  searchParams,
}: PageProps<"/plugins">) {
  const { category } = await searchParams;

  const all = await db
    .select()
    .from(plugins)
    .where(eq(plugins.published, true))
    .orderBy(asc(plugins.sortOrder), asc(plugins.name));

  const categories = [...new Set(all.map((p) => p.category))];
  const filtered =
    typeof category === "string" && category
      ? all.filter((p) => p.category === category)
      : all;

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <PageHeader
        eyebrow="Showcase"
        title="Plugin showcase"
        subtitle="Every plugin ships with BruLite membership."
      />

      {categories.length > 1 && (
        <div className="mb-8 flex flex-wrap gap-2">
          <Link
            href="/plugins"
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              !category
                ? "border-primary/50 bg-primary/15 text-accent"
                : "border-white/10 text-muted hover:border-primary/40 hover:text-foreground"
            )}
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={`/plugins?category=${encodeURIComponent(c)}`}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm capitalize transition-colors",
                category === c
                  ? "border-primary/50 bg-primary/15 text-accent"
                  : "border-white/10 text-muted hover:border-primary/40 hover:text-foreground"
              )}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="py-16 text-center text-muted">
          <Puzzle className="mx-auto mb-4 h-10 w-10 opacity-50" />
          No plugins published yet — check back soon.
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p, i) => (
            <Reveal key={p.id} delay={(i % 3) * 80}>
              <Card hover className="flex h-full flex-col p-0 overflow-hidden">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-primary/20 to-surface-2">
                    <Puzzle className="h-9 w-9 text-accent/50" />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{p.name}</h3>
                    <Badge tone="purple">{p.category}</Badge>
                  </div>
                  <p className="mt-2 flex-1 text-sm text-muted">
                    {p.description}
                  </p>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
