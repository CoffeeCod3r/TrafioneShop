"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (response?.ok) {
      router.refresh();
      return;
    }
    const data = (await response?.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error ?? "Nie udało się zalogować.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-col gap-4 py-16">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Lock className="size-6" aria-hidden />
        Panel admina
      </h1>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Hasło
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-12 rounded-xl border-2 bg-card px-4 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </label>
      <Button type="submit" size="xl" disabled={busy || !password}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        Zaloguj
      </Button>
      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function AdminLogoutButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
        router.refresh();
      }}
    >
      Wyloguj
    </Button>
  );
}
