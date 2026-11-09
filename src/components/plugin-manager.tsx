"use client";

import { useRef, useState } from "react";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/ui";
import { useRouter } from "next/navigation";

export interface PluginRow {
  id: string;
  name: string;
  description: string;
  category: string;
  imageUrl: string | null;
  sortOrder: number;
  published: boolean;
}

export function PluginManager({ plugins }: { plugins: PluginRow[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<PluginRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [imageUrl, setImageUrl] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [published, setPublished] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEditing(null);
    setName("");
    setDescription("");
    setCategory("general");
    setImageUrl("");
    setSortOrder(0);
    setPublished(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  function load(p: PluginRow) {
    setEditing(p);
    setName(p.name);
    setDescription(p.description);
    setCategory(p.category);
    setImageUrl(p.imageUrl ?? "");
    setSortOrder(p.sortOrder);
    setPublished(p.published);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadImage(): Promise<string | null> {
    const file = fileRef.current?.files?.[0];
    if (!file) return imageUrl || null;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body: form });
    if (!res.ok) throw new Error("upload_failed");
    return (await res.json()).url as string;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadImage();
      const payload = {
        name,
        description,
        category,
        imageUrl: uploaded,
        sortOrder,
        published,
      };
      const res = await fetch(
        editing ? `/api/admin/plugins/${editing.id}` : "/api/admin/plugins",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error();
      reset();
      router.refresh();
    } catch {
      setError("Save failed — check fields and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this plugin?")) return;
    await fetch(`/api/admin/plugins/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
      <Card>
        <h2 className="mb-4 font-semibold">
          {editing ? `Edit: ${editing.name}` : "New plugin"}
        </h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              maxLength={2000}
              className="min-h-24"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Sort order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <Label>Screenshot</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-background"
            />
            {imageUrl && (
              <p className="mt-1 truncate text-xs text-muted">
                Current: {imageUrl}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="accent-primary"
            />
            Published (visible on the public showcase)
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create plugin"}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <div className="space-y-3">
        {plugins.length === 0 && (
          <Card className="py-10 text-center text-sm text-muted">
            No plugins yet.
          </Card>
        )}
        {plugins.map((p) => (
          <Card key={p.id} className="flex items-start justify-between gap-4 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <Badge tone="accent">{p.category}</Badge>
                {!p.published && <Badge>hidden</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">
                {p.description}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" onClick={() => load(p)}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => remove(p.id)}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
