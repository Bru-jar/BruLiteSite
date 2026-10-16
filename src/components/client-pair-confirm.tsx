"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function ClientPairConfirm({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );

  async function confirm() {
    setState("working");
    try {
      const res = await fetch(
        `/api/client/pair/${encodeURIComponent(code)}/complete`,
        { method: "POST" },
      );
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="mt-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300">
        Client linked — you can close this tab and return to BruLite.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <p className="mb-4 text-sm text-muted">
        Confirm this code matches your launcher: <strong>{code}</strong>. Only
        approve a sign-in you started.
      </p>
      {state === "error" && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          This code is invalid or expired — restart sign-in from the client.
        </p>
      )}
      <Button
        className="w-full"
        disabled={state === "working"}
        onClick={confirm}
      >
        {state === "working" ? "Linking…" : "Authorize client"}
      </Button>
    </div>
  );
}
