"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";

type Props = { stadiumSlug: string; canRegister: boolean };

export function LoginForm({ stadiumSlug, canRegister }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "create">(canRegister ? "create" : "sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const next = `/${stadiumSlug}/management`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result =
      mode === "create"
        ? await signUp.email({ name: name.trim() || "Kitchen", email, password, callbackURL: next })
        : await signIn.email({ email, password, callbackURL: next });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Could not sign in.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
      {mode === "create" ? (
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="input input--secondary mt-1.5 min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[15px]"
          />
        </label>
      ) : null}
      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Email</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          className="input input--secondary mt-1.5 min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[15px]"
        />
      </label>
      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Password</span>
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "create" ? "new-password" : "current-password"}
          className="input input--secondary mt-1.5 min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[15px]"
        />
      </label>
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
      <button type="submit" disabled={pending} className="button button--primary button--lg mt-2 w-full">
        {pending ? "Please wait" : mode === "create" ? "Create kitchen account" : "Sign in"}
      </button>
      {canRegister && mode === "sign-in" ? (
        <button type="button" className="text-[13px] text-muted" onClick={() => setMode("create")}>
          First time here? Create the kitchen account
        </button>
      ) : null}
      {mode === "create" && !canRegister ? null : mode === "create" ? (
        <button type="button" className="text-[13px] text-muted" onClick={() => setMode("sign-in")}>
          Already have an account? Sign in
        </button>
      ) : null}
    </form>
  );
}
