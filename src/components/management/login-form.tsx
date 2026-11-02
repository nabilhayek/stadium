"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp, requestPasswordReset, twoFactor } from "@/lib/auth-client";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast/toast-provider";

type Props = { stadiumSlug: string; canRegister: boolean };

const FIELD = "input input--secondary mt-1.5 min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[15px]";
const LABEL = "text-[11px] font-medium uppercase tracking-[0.14em] text-muted";

export function LoginForm({ stadiumSlug, canRegister }: Props) {
  const t = useTranslations("login");
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "create" | "forgot" | "code">(canRegister ? "create" : "sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [trust, setTrust] = useState(false);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();
  const next = `/${stadiumSlug}/management`;

  function done() {
    router.push(next);
    router.refresh();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);

    if (mode === "code") {
      const clean = code.replace(/\s/g, "");
      const result = backup
        ? await twoFactor.verifyBackupCode({ code: clean, trustDevice: trust })
        : await twoFactor.verifyTotp({ code: clean, trustDevice: trust });
      setPending(false);
      if (result.error) {
        toast({ message: result.error.message ?? t("codeWrong"), status: "error" });
        setCode("");
        return;
      }
      done();
      return;
    }

    const result =
      mode === "forgot"
        ? await requestPasswordReset({ email, redirectTo: next })
        : mode === "create"
          ? await signUp.email({ name: name.trim() || "Kitchen", email, password, callbackURL: next })
          : await signIn.email({ email, password, callbackURL: next });
    setPending(false);
    if (result.error) {
      toast({ message: result.error.message ?? t("couldNotSignIn"), status: "error" });
      return;
    }
    if (mode === "forgot") {
      toast({ message: t("resetSent"), status: "success" });
      setMode("sign-in");
      return;
    }
    if (mode === "sign-in" && result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
      setMode("code");
      return;
    }
    done();
  }

  if (mode === "code") {
    return (
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{t("codeTitle")}</h2>
        <p className="text-[13px] text-muted">{backup ? t("backupLead") : t("codeLead")}</p>
        <label className="block">
          <span className={LABEL}>{backup ? t("backupCode") : t("code")}</span>
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={backup ? "text" : "numeric"}
            autoComplete="one-time-code"
            maxLength={backup ? 24 : 7}
            className={`${FIELD} tracking-[0.3em] tabular-nums`}
          />
        </label>
        <label className="flex items-center gap-2.5 text-[14px]">
          <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} className="size-4 accent-neutral-900" />
          {t("trustDevice")}
        </label>
        <button type="submit" disabled={pending} className="button button--primary button--lg mt-2 w-full">
          {pending ? t("pleaseWait") : t("verify")}
        </button>
        <button
          type="button"
          className="text-[13px] text-muted"
          onClick={() => {
            setBackup((v) => !v);
            setCode("");
          }}
        >
          {backup ? t("useAuthenticator") : t("useBackup")}
        </button>
        <button type="button" className="text-[13px] text-muted" onClick={() => setMode("sign-in")}>
          {t("backToSignIn")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
      {mode === "create" ? (
        <label className="block">
          <span className={LABEL}>{t("name")}</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={FIELD} />
        </label>
      ) : null}
      {mode === "forgot" ? <p className="text-[13px] text-muted">{t("forgotLead")}</p> : null}
      <label className="block">
        <span className={LABEL}>{t("email")}</span>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className={FIELD} />
      </label>
      {mode === "forgot" ? null : (
        <label className="block">
          <span className={LABEL}>{t("password")}</span>
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            className={FIELD}
          />
        </label>
      )}
      <button type="submit" disabled={pending} className="button button--primary button--lg mt-2 w-full">
        {pending ? t("pleaseWait") : mode === "forgot" ? t("sendReset") : mode === "create" ? t("createAccount") : t("signIn")}
      </button>
      {mode === "sign-in" ? (
        <button type="button" className="text-[13px] text-muted" onClick={() => setMode("forgot")}>
          {t("forgot")}
        </button>
      ) : null}
      {mode === "forgot" ? (
        <button type="button" className="text-[13px] text-muted" onClick={() => setMode("sign-in")}>
          {t("backToSignIn")}
        </button>
      ) : null}
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
