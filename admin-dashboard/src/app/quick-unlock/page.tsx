"use client";
import { useState } from "react";

export default function QuickUnlockPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUnlock() {
    setLoading(true);
    setStatus(null);
    try {
      // TODO: Replace with actual deviceId logic (e.g., from user profile or config)
      const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "DEVICE_ID_HERE";
      const res = await fetch("/api/commands/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("Door unlock command sent!");
      } else {
        setStatus(data.error || "Failed to send unlock command.");
      }
    } catch (e: any) {
      setStatus(e.message || "Error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
      <h1 className="text-2xl font-bold mb-4">Quick Unlock</h1>
      <button
        className="px-6 py-3 bg-blue-600 text-white rounded shadow hover:bg-blue-700 disabled:opacity-50"
        onClick={handleUnlock}
        disabled={loading}
      >
        {loading ? "Unlocking..." : "Unlock Door"}
      </button>
      {status && <p className="mt-4 text-center">{status}</p>}
    </main>
  );
}
