import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { postTicketToDiscord } from "@/lib/discord";
import { proxyUrl, uploadFile } from "@/lib/blob";
import { rateLimit } from "@/lib/rate-limit";

const createSchema = z.object({
  type: z.enum(["bug", "feature"]),
  title: z.string().min(5).max(200),
  body: z.string().min(10).max(5000),
  steps: z.string().max(5000).optional(),
  extra: z.string().max(5000).optional(),
});

const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8 MB
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/** GET /api/tickets — list the current user's tickets. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select()
    .from(tickets)
    .where(eq(tickets.userId, session.userId))
    .orderBy(desc(tickets.createdAt));
  return NextResponse.json({ tickets: rows });
}

/**
 * POST /api/tickets — create a bug report or feature request.
 * Accepts multipart/form-data with an optional `image` file (screenshot).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`ticket:${session.userId}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse({
    type: form.get("type"),
    title: form.get("title"),
    body: form.get("body"),
    steps: form.get("steps") || undefined,
    extra: form.get("extra") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Optional screenshot — private blob, exposed via /api/blob proxy URL so
  // Discord and <img> tags can fetch it.
  let imageUrl: string | null = null;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    if (!IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "bad_image_type" }, { status: 415 });
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: "image_too_large" }, { status: 413 });
    }
    try {
      const blob = await uploadFile(`tickets/${file.name}`, file, "private");
      imageUrl = proxyUrl(blob.url);
    } catch (e) {
      console.error("ticket image upload failed", e);
      // Fail rather than silently drop evidence the user expected to attach.
      return NextResponse.json(
        { error: "image_upload_failed" },
        { status: 502 },
      );
    }
  }

  const [ticket] = await db
    .insert(tickets)
    .values({
      userId: session.userId,
      type: parsed.data.type,
      title: parsed.data.title,
      body: parsed.data.body,
      steps: parsed.data.steps ?? null,
      extra: parsed.data.extra ?? null,
      imageUrl,
    })
    .returning();

  // Mirror to Discord — best effort; ticket already exists if this fails.
  const messageId = await postTicketToDiscord({
    ticketId: ticket.id,
    type: ticket.type as "bug" | "feature",
    title: ticket.title,
    body: ticket.body,
    steps: ticket.steps,
    extra: ticket.extra,
    imageUrl: ticket.imageUrl,
    username: session.username,
  });
  if (messageId) {
    await db
      .update(tickets)
      .set({ discordMessageId: messageId })
      .where(eq(tickets.id, ticket.id));
  }

  return NextResponse.json({ ticket }, { status: 201 });
}
