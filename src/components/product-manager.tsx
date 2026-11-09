"use client";

import { useState } from "react";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { formatUsd } from "@/lib/utils";
import { useRouter } from "next/navigation";

export interface ProductWithPrices {
  id: string;
  name: string;
  category: string;
  active: boolean;
  description: string | null;
  prices: {
    id: string;
    stripePriceId: string;
    interval: string;
    amountUsdCents: number;
    active: boolean;
  }[];
}

export function ProductManager({ products }: { products: ProductWithPrices[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("membership");
  const [stripePriceId, setStripePriceId] = useState("");
  const [interval, setInterval_] = useState("month");
  const [amountUsd, setAmountUsd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          category,
          stripePriceId,
          interval,
          amountUsdCents: Math.round(parseFloat(amountUsd) * 100),
        }),
      });
      if (!res.ok) throw new Error();
      setName("");
      setDescription("");
      setStripePriceId("");
      setAmountUsd("");
      router.refresh();
    } catch {
      setError("Create failed — check the fields (Stripe price ID must start with price_).");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    await fetch(`/api/admin/products?id=${id}&active=${!active}`, {
      method: "PATCH",
    });
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
      <Card>
        <h2 className="mb-2 font-semibold">New product</h2>
        <p className="mb-4 text-xs text-muted">
          Create the product + price in the Stripe dashboard first, then bind
          the <code className="text-accent">price_…</code> ID here.
        </p>
        <form onSubmit={create} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="membership"
              />
            </div>
            <div>
              <Label>Interval</Label>
              <Select
                className="w-full"
                value={interval}
                onChange={(e) => setInterval_(e.target.value)}
              >
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
                <option value="one_time">One-time</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Stripe price ID</Label>
              <Input
                value={stripePriceId}
                onChange={(e) => setStripePriceId(e.target.value)}
                placeholder="price_…"
                required
              />
            </div>
            <div>
              <Label>Price (USD)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.5"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                placeholder="9.99"
                required
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create product"}
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        {products.length === 0 && (
          <Card className="py-10 text-center text-sm text-muted">
            No products — add your first membership plan.
          </Card>
        )}
        {products.map((p) => (
          <Card key={p.id} className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <Badge tone="accent">{p.category}</Badge>
                  {!p.active && <Badge>inactive</Badge>}
                </div>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {p.prices.map((pr) => (
                    <li key={pr.id}>
                      {formatUsd(pr.amountUsdCents)} / {pr.interval} ·{" "}
                      <code className="text-xs">{pr.stripePriceId}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <Button variant="ghost" onClick={() => toggle(p.id, p.active)}>
                {p.active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
