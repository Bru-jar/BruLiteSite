"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
type Policy = { plan: string; deviceLimit: number; concurrentLimit: number };
export function LicensePolicyManager({ policies }: { policies: Policy[] }) {
  const [rows, setRows] = useState(policies);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(row: Policy) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/license-policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      setMessage(
        res.ok
          ? "Limits saved. Running clients are checked again on their next renewal."
          : "Could not save limits. Check the values and try again.",
      );
    } catch {
      setMessage("Connection failed. Your changes have not been saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mb-6 rounded-lg border border-border bg-surface p-5">
      <h2 className="font-semibold">Membership limits</h2>
      <p className="mt-2 text-sm text-muted">
        Registered devices and running clients have separate limits. Account
        overrides take precedence.
      </p>
      <div className="mt-4 space-y-4">
        {rows.map((row, index) => (
          <form
            key={row.plan}
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save(row);
            }}
          >
            <span className="min-w-24 py-2 capitalize">{row.plan}</span>
            {(["deviceLimit", "concurrentLimit"] as const).map((field) => (
              <label key={field} className="text-sm">
                {field === "deviceLimit"
                  ? "Registered devices"
                  : "Running clients"}
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={row[field]}
                  className="ml-2 w-20 rounded border border-border bg-surface-2 p-2"
                  onChange={(event) =>
                    setRows(
                      rows.map((item, i) =>
                        i === index
                          ? { ...item, [field]: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                />
              </label>
            ))}
            <Button disabled={busy} type="submit" variant="secondary">
              Save {row.plan} limits
            </Button>
          </form>
        ))}
      </div>
      {message && (
        <p role="status" className="mt-3 text-sm text-muted">
          {message}
        </p>
      )}
    </section>
  );
}
