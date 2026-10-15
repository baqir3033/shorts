"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function GuestSignIn() {
  const [name, setName] = useState("Creator");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await signIn("guest", { name, redirect: false });
        setBusy(false);
      }}
    >
      <label className="text-xs text-zinc-400">
        Display name
        <input
          className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-950 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Continue as guest"}
      </button>
    </form>
  );
}
