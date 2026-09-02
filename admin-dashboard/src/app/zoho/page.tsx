"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface Mapping {
  uid: string;
  zoho_emp_id: string | null;
  email: string | null;
  full_name: string | null;
  active: boolean;
}

interface SyncRow {
  id: string;
  uid: string;
  employee: string;
  logged_at: string;
  zoho_direction: string | null;
  zoho_status: string | null;
}

export default function ZohoPage() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [recent, setRecent] = useState<SyncRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Mapping>({
    uid: "",
    zoho_emp_id: "",
    email: "",
    full_name: "",
    active: true,
  });
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const [{ data: maps }, { data: sync }, { data: uids }] = await Promise.all([
      supabase.from("zoho_employee_map").select("*").order("full_name"),
      supabase.from("zoho_sync_overview").select("*").limit(25),
      supabase.from("device_uids").select("uid").eq("state", "WHITELIST"),
    ]);

    setMappings(maps ?? []);
    setRecent(sync ?? []);

    // Whitelisted cards that have no Zoho mapping yet
    const mapped = new Set((maps ?? []).map((m) => m.uid.toUpperCase()));
    const all = new Set(
      (uids ?? []).map((u: { uid: string }) => u.uid.toUpperCase()),
    );
    setUnmapped([...all].filter((u) => !mapped.has(u)));

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!draft.uid.trim()) return;
    if (!draft.zoho_emp_id?.trim() && !draft.email?.trim()) {
      setMsg(
        "Provide a Zoho Employee ID or email (or set the Mapper ID in Zoho to this UID instead).",
      );
      return;
    }

    const { error } = await supabase.from("zoho_employee_map").upsert({
      uid: draft.uid.trim().toUpperCase(),
      zoho_emp_id: draft.zoho_emp_id?.trim() || null,
      email: draft.email?.trim() || null,
      full_name: draft.full_name?.trim() || null,
      active: draft.active,
      updated_at: new Date().toISOString(),
    });

    setMsg(error ? error.message : "Saved");
    if (!error) {
      setDraft({
        uid: "",
        zoho_emp_id: "",
        email: "",
        full_name: "",
        active: true,
      });
      load();
    }
  }

  async function remove(uid: string) {
    await supabase.from("zoho_employee_map").delete().eq("uid", uid);
    load();
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-1">Zoho People</h1>
      <p className="text-gray-600 mb-8">
        Map RFID cards to employees. Taps sync to Zoho attendance every 5
        minutes.
      </p>

      {msg && (
        <div className="mb-4 px-3 py-2 rounded bg-blue-50 border border-blue-200 text-sm">
          {msg}
        </div>
      )}

      {/* Add / edit mapping */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="font-semibold mb-4">Add / update mapping</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <input
            placeholder="RFID UID"
            value={draft.uid}
            onChange={(e) => setDraft({ ...draft, uid: e.target.value })}
            className="border rounded px-3 py-2 font-mono"
          />
          <input
            placeholder="Zoho Employee ID"
            value={draft.zoho_emp_id ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, zoho_emp_id: e.target.value })
            }
            className="border rounded px-3 py-2"
          />
          <input
            placeholder="Email (fallback)"
            value={draft.email ?? ""}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            className="border rounded px-3 py-2"
          />
          <input
            placeholder="Full name"
            value={draft.full_name ?? ""}
            onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
            className="border rounded px-3 py-2"
          />
        </div>
        <button
          onClick={save}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold"
        >
          Save mapping
        </button>
      </div>

      {/* Unmapped cards */}
      {unmapped.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
          <h2 className="font-semibold mb-2">
            Whitelisted cards with no Zoho mapping ({unmapped.length})
          </h2>
          <p className="text-sm text-gray-600 mb-3">
            These open the door but won&apos;t record attendance unless the
            employee&apos;s Mapper ID in Zoho equals the UID.
          </p>
          <div className="flex flex-wrap gap-2">
            {unmapped.map((u) => (
              <button
                key={u}
                onClick={() => setDraft({ ...draft, uid: u })}
                className="font-mono text-sm bg-white border rounded px-2 py-1 hover:bg-gray-50"
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Existing mappings */}
      <div className="bg-white rounded-lg shadow mb-8 overflow-x-auto">
        <h2 className="font-semibold p-4 border-b">Mapped employees</h2>
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              {["UID", "Employee", "Zoho ID", "Email", ""].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {mappings.map((m) => (
              <tr key={m.uid}>
                <td className="px-4 py-3 font-mono text-sm">{m.uid}</td>
                <td className="px-4 py-3 text-sm">{m.full_name || "-"}</td>
                <td className="px-4 py-3 text-sm">{m.zoho_emp_id || "-"}</td>
                <td className="px-4 py-3 text-sm">{m.email || "-"}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => remove(m.uid)}
                    className="text-red-600 text-sm hover:underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {!loading && mappings.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-gray-400 text-sm"
                >
                  No mappings yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recent sync activity */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <h2 className="font-semibold p-4 border-b">Recent attendance sync</h2>
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              {["Time", "Employee", "UID", "Direction", "Status"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {recent.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-sm">
                  {new Date(r.logged_at).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </td>
                <td className="px-4 py-3 text-sm">{r.employee}</td>
                <td className="px-4 py-3 font-mono text-sm">{r.uid}</td>
                <td className="px-4 py-3 text-sm">{r.zoho_direction || "-"}</td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={
                      r.zoho_status === "OK"
                        ? "text-green-700"
                        : r.zoho_status?.startsWith("SKIPPED")
                          ? "text-gray-500"
                          : r.zoho_status
                            ? "text-red-600"
                            : "text-amber-600"
                    }
                  >
                    {r.zoho_status || "pending"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
