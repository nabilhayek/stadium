"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { resetPassword } from "@/lib/auth-client";
import { useToast } from "@/components/toast/toast-provider";

export function ResetPasswordForm({ token, callbackURL, invite = false }: { token: string; callbackURL: string; invite?: boolean }) {
  const t = useTranslations("login");
  const router = useRouter();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast({ message: t("passwordsDontMatch"), status: "error" });
      return;
    }
    setPending(true);
    const result = await resetPassword({ newPassword: password, token });
    setPending(false);
    if (result.error) {
      toast({ message: t("resetFailed"), status: "error" });
      return;
    }
    toast({ message: invite ? t("passwordCreated") : t("passwordUpdated"), status: "success" });
    router.push(callbackURL.startsWith("/") ? callbackURL : "/");
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{invite ? t("password") : t("newPassword")}</span>
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="input input--secondary mt-1.5 min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[15px]"
        />
      </label>
      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{t("confirmPassword")}</span>
        <input
          required
          type="password"
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="input input--secondary mt-1.5 min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[15px]"
        />
      </label>
      <button type="submit" disabled={pending} className="button button--primary button--lg mt-2 w-full">
        {pending ? t("pleaseWait") : invite ? t("createPassword") : t("resetTitle")}
      </button>
    </form>
  );
}
