"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
type Device = { id: string; name: string; revokedAt: string | null };
type Data = {
  deviceLimit: number | null;
  concurrentLimit: number | null;
  devices: Device[];
  sessions: { id: string; deviceId: string }[];
};
export function UserDevicesPanel({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [devices, setDevices] = useState(""),
    [clients, setClients] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    const res = await fetch(`/api/admin/users/${userId}/devices`);
    if (!res.ok) throw new Error("load failed");
    const value: Data = await res.json();
    setData(value);
    setDevices(value.deviceLimit === null ? "" : String(value.deviceLimit));
    setClients(
      value.concurrentLimit === null ? "" : String(value.concurrentLimit),
    );
  }
  async function act(body: object) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/users/${userId}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("save failed");
      await load();
      setMessage("Saved.");
    } catch {
      setMessage(
        "Could not update this account. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <Button
        variant="ghost"
        onClick={() => {
          setOpen(true);
          void load().catch(() => setMessage("Could not load devices."));
        }}
      >
        Devices
      </Button>
    );
  return (
    <div className="mt-3 w-full rounded-lg border border-border bg-surface-2 p-4 text-sm">
      <div className="flex justify-between">
        <p className="font-medium">Devices and running clients</p>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <p className="mt-2 text-muted">
        Leave an override blank to use the membership plan limits.
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void act({
            action: "set_limit",
            deviceLimit: devices === "" ? null : Number(devices),
            concurrentLimit: clients === "" ? null : Number(clients),
          });
        }}
      >
        <label>
          Device override
          <input
            type="number"
            min={1}
            max={100}
            value={devices}
            onChange={(e) => setDevices(e.target.value)}
            className="ml-2 w-20 rounded border border-border bg-surface p-2"
          />
        </label>
        <label>
          Client override
          <input
            type="number"
            min={1}
            max={100}
            value={clients}
            onChange={(e) => setClients(e.target.value)}
            className="ml-2 w-20 rounded border border-border bg-surface p-2"
          />
        </label>
        <Button type="submit" disabled={busy} variant="secondary">
          Save overrides
        </Button>
      </form>
      {data && (
        <p className="mt-3 text-muted">
          {data.sessions.length} running clients
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {data?.devices
          .filter((d) => !d.revokedAt)
          .map((device) => (
            <li key={device.id} className="flex justify-between">
              <span>{device.name}</span>
              <Button
                disabled={busy}
                variant="danger"
                onClick={() => {
                  if (confirm("Disconnect this device and end its sessions?"))
                    void act({ action: "revoke_device", deviceId: device.id });
                }}
              >
                Disconnect
              </Button>
            </li>
          ))}
      </ul>
      {message && (
        <p role="status" className="mt-3 text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
