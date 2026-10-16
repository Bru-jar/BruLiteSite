"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch("/api/portal", { method: "POST" });
          const data = await res.json();
          if (res.ok && data.url) window.location.assign(data.url);
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "Opening…" : "Manage billing"}
    </Button>
  );
}

export function RevokeTokenButton({ tokenId }: { tokenId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await fetch("/api/client/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenId }),
        });
        router.refresh();
      }}
    >
      Revoke
    </Button>
  );
}

/** The browser only approves a key enrolled by the launcher. */
export function NewTokenButton() {
  return (
    <p className="text-sm text-muted">
      To connect a device, open BruLite and choose Sign in. Approve the matching
      code in your browser.
    </p>
  );
}
