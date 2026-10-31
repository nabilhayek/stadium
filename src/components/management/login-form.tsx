"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast/toast-provider";

type Props = { stadiumSlug: string; canRegister: boolean };

export function LoginForm({ stadiumSlug, canRegister }: Props) {
  const t = useTranslations("login");
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "create">(canRegister ? "create" : "sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const { toast } = useToast();
  const next = `/${stadiumSlug}/management`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    const result =
      mode === "create"
        ? await signUp.email({ name: name.trim() || "Kitchen", email, password, callbackURL: next })
        : await signIn.email({ email, password, callbackURL: next });
    setPending(false);
    if (result.error) {
      toast({ message: result.error.message ?? t("couldNotSignIn"), status: "error" });
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
      {mode === "create" ? (
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{t("name")}</span>
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
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{t("email")}</span>
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
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{t("password")}</span>
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
      <button type="submit" disabled={pending} className="button button--primary button--lg mt-2 w-full">
        {pending ? t("pleaseWait") : mode === "create" ? t("createAccount") : t("signIn")}
      </button>
      {canRegister && mode === "sign-in" ? (
        <button type="button" className="text-[13px] text-muted" onClick={() => setMode("create")}>
          {t("firstTime")}
        </button>
      ) : null}
      {mode === "create" && !canRegister ? null : mode === "create" ? (
        <button type="button" className="text-[13px] text-muted" onClick={() => setMode("sign-in")}>
          {t("alreadyHave")}
        </button>
      ) : null}
    </form>
  );
}
