"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
export function DisconnectDevice({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          if (!confirm("Disconnect this device and end its running sessions?"))
            return;
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/client/devices", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deviceId }),
            });
            if (!res.ok) throw new Error("disconnect failed");
            router.refresh();
          } catch {
            setError("Could not disconnect. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Disconnect
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
