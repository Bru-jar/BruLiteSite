"use client";

import { useRef, useState } from "react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useRouter } from "next/navigation";

export function TicketForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<"bug" | "feature">("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [steps, setSteps] = useState("");
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("title", title);
      form.append("body", body);
      if (steps) form.append("steps", steps);
      if (extra) form.append("extra", extra);
      const file = fileRef.current?.files?.[0];
      if (file) form.append("image", file);

      const res = await fetch("/api/tickets", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "rate_limited"
            ? "Slow down — too many tickets in a short time."
            : data.error === "bad_image_type"
              ? "Images must be PNG, JPG, WebP or GIF."
              : data.error === "image_too_large"
                ? "Image too large — 8 MB max."
                : data.error === "image_upload_failed"
                  ? "Image upload failed — remove it or try again."
                  : "Couldn't create the ticket — check the fields and try again."
        );
        return;
      }
      router.push(`/support/${data.ticket.id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="type">Type</Label>
        <Select
          id="type"
          value={type}
          onChange={(e) => setType(e.target.value as "bug" | "feature")}
        >
          <option value="bug">Bug report</option>
          <option value="feature">Feature request</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            type === "bug"
              ? "e.g. Client crashes on startup"
              : "e.g. Add a loot tracker overlay"
          }
          required
          minLength={5}
          maxLength={200}
        />
      </div>
      <div>
        <Label htmlFor="body">Details</Label>
        <Textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            type === "bug"
              ? "What happened? Error messages, client version…"
              : "Describe the feature and why it's useful…"
          }
          required
          minLength={10}
          maxLength={5000}
        />
      </div>
      {type === "bug" && (
        <div>
          <Label htmlFor="steps">Steps to reproduce</Label>
          <Textarea
            id="steps"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder={"1. Open the client\n2. Enable plugin X\n3. …"}
            maxLength={5000}
            className="min-h-24"
          />
        </div>
      )}
      <div>
        <Label htmlFor="extra">Other info (optional)</Label>
        <Textarea
          id="extra"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="Client version, OS, when it started, links…"
          maxLength={5000}
          className="min-h-20"
        />
      </div>
      <div>
        <Label htmlFor="image">Screenshot (optional)</Label>
        <input
          ref={fileRef}
          id="image"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-background"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Submitting…" : `Submit ${type === "bug" ? "bug" : "request"}`}
      </Button>
    </form>
  );
}
