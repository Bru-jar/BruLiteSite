"use client";

import { useRef, useState } from "react";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/ui";
import { useRouter } from "next/navigation";

export interface ReleaseRow {
  id: string;
  version: string;
  platform: string;
  artifactType: string;
  fileName: string;
  notes: string | null;
  createdAt: string | Date;
}

export function ReleaseManager({ releases }: { releases: ReleaseRow[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState("");
  const [platform, setPlatform] = useState("windows-x64");
  const [artifactType, setArtifactType] = useState("bundle");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("version", version);
      form.append("platform", platform);
      form.append("artifactType", artifactType);
      if (notes) form.append("notes", notes);
      const res = await fetch("/api/admin/releases", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error();
      setVersion("");
      setNotes("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError("Upload failed — check the file and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (
      !confirm(
        "Delete this release? Users will no longer be able to download it.",
      )
    )
      return;
    await fetch(`/api/admin/releases?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
      <Card>
        <h2 className="mb-2 font-semibold">Upload a build</h2>
        <p className="mb-4 text-xs text-muted">
          Stored privately — downloadable only by members via the dashboard. The
          newest upload is the one served.
        </p>
        <form onSubmit={upload} className="space-y-4">
          <div>
            <Label>Version</Label>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Platform</Label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                <option value="windows-x64">Windows x64</option>
                <option value="macos-arm64">macOS Apple Silicon</option>
                <option value="universal">Universal</option>
              </select>
            </div>
            <div>
              <Label>Artifact type</Label>
              <select
                value={artifactType}
                onChange={(e) => setArtifactType(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                <option value="bundle">Bundle (installer zip)</option>
                <option value="jar">Jar (auto-update)</option>
              </select>
            </div>
          </div>
          <div>
            <Label>File (installer / jar / zip)</Label>
            <input
              ref={fileRef}
              type="file"
              required
              className="w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-background"
            />
          </div>
          <div>
            <Label>Release notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-20"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? "Uploading…" : "Upload release"}
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        {releases.length === 0 && (
          <Card className="py-10 text-center text-sm text-muted">
            No releases uploaded yet.
          </Card>
        )}
        {releases.map((r, i) => (
          <Card
            key={r.id}
            className="flex items-start justify-between gap-4 py-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">v{r.version}</span>
                <Badge>{r.platform}</Badge>
                <Badge>{r.artifactType}</Badge>
                {i === 0 && <Badge tone="green">latest</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted">
                {r.fileName} ·{" "}
                {new Date(r.createdAt).toLocaleDateString("en-GB")}
              </p>
              {r.notes && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                  {r.notes}
                </p>
              )}
            </div>
            <Button variant="danger" onClick={() => remove(r.id)}>
              Delete
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
