"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import QRCode from "react-qr-code";
import { Check, Copy, Download, ShieldCheck } from "lucide-react";
import { twoFactor } from "@/lib/auth-client";
import { useToast } from "@/components/toast/toast-provider";

type Props = { stadiumSlug: string; enabled: boolean; locked: boolean; required: boolean };
type Step = "idle" | "scan" | "codes";

const FIELD = "input input--secondary mt-1.5 min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[15px]";
const LABEL = "text-[11px] font-medium uppercase tracking-[0.14em] text-muted";

export function TwoFactorPanel({ stadiumSlug, enabled, locked, required }: Props) {
  const t = useTranslations("security");
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [uri, setUri] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const desk = `/${stadiumSlug}/management`;
  const secret = uri ? (new URL(uri).searchParams.get("secret") ?? "") : "";

  function fail(message: string | undefined) {
    toast({ message: message ?? t("failed"), status: "error" });
  }

  async function start(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await twoFactor.enable({ password });
    setPending(false);
    if (result.error || !result.data || !("totpURI" in result.data)) return fail(result.error?.message);
    setUri(result.data.totpURI);
    setCodes(result.data.backupCodes);
    setPassword("");
    setStep("scan");
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    setPending(false);
    if (result.error) {
      setCode("");
      return fail(result.error.message ?? t("codeWrong"));
    }
    setStep("codes");
  }

  async function regenerate(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await twoFactor.generateBackupCodes({ password });
    setPending(false);
    if (result.error || !result.data) return fail(result.error?.message);
    setCodes(result.data.backupCodes);
    setPassword("");
    setStep("codes");
  }

  async function turnOff() {
    if (!password) return fail(t("passwordNeeded"));
    setPending(true);
    const result = await twoFactor.disable({ password });
    setPending(false);
    if (result.error) return fail(result.error.message);
    setPassword("");
    toast({ message: t("turnedOff"), status: "success" });
    router.refresh();
  }

  async function copy() {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([`${t("backupFileTitle")}\n\n${codes.join("\n")}\n`], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "seat-service-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function finish() {
    router.push(desk);
    router.refresh();
  }

  if (step === "codes") {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-[17px] font-semibold">{t("codesTitle")}</h2>
        <p className="text-[14px] text-muted">{t("codesLead")}</p>
        <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-background p-4 font-mono text-[14px] tabular-nums">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button type="button" onClick={copy} className="button button--secondary flex-1">
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? t("copied") : t("copy")}
          </button>
          <button type="button" onClick={download} className="button button--secondary flex-1">
            <Download className="size-4" aria-hidden />
            {t("download")}
          </button>
        </div>
        <button type="button" onClick={finish} className="button button--primary button--lg w-full">
          {t("savedThem")}
        </button>
      </div>
    );
  }

  if (step === "scan") {
    return (
      <form onSubmit={confirm} className="flex flex-col gap-4">
        <h2 className="text-[17px] font-semibold">{t("scanTitle")}</h2>
        <p className="text-[14px] text-muted">{t("scanLead")}</p>
        <div className="self-center rounded-2xl border border-border bg-white p-4">
          <QRCode value={uri} size={176} />
        </div>
        {secret ? (
          <p className="text-center text-[12px] text-muted">
            {t("manualKey")} <span className="font-mono tracking-wider break-all text-foreground">{secret}</span>
          </p>
        ) : null}
        <label className="block">
          <span className={LABEL}>{t("enterCode")}</span>
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            className={`${FIELD} tracking-[0.3em] tabular-nums`}
          />
        </label>
        <button type="submit" disabled={pending} className="button button--primary button--lg w-full">
          {pending ? t("pleaseWait") : t("confirm")}
        </button>
      </form>
    );
  }

  if (!enabled) {
    return (
      <form onSubmit={start} className="flex flex-col gap-4">
        <h2 className="text-[17px] font-semibold">{t("setupTitle")}</h2>
        <p className="text-[14px] text-muted">{required ? t("requiredLead") : t("setupLead")}</p>
        <label className="block">
          <span className={LABEL}>{t("password")}</span>
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={FIELD} />
        </label>
        <button type="submit" disabled={pending} className="button button--primary button--lg w-full">
          {pending ? t("pleaseWait") : t("setUp")}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-[15px] font-medium text-green-700">
        <ShieldCheck className="size-5" aria-hidden />
        {t("on")}
      </p>
      <form onSubmit={regenerate} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
        <p className="text-[14px] text-muted">{t("manageLead")}</p>
        <label className="block">
          <span className={LABEL}>{t("password")}</span>
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={FIELD} />
        </label>
        <button type="submit" disabled={pending} className="button button--secondary w-full">
          {t("newBackupCodes")}
        </button>
        {locked ? (
          <p className="text-[13px] text-muted">{t("lockedNote")}</p>
        ) : (
          <button type="button" disabled={pending} onClick={turnOff} className="text-[13px] text-red-600">
            {t("turnOff")}
          </button>
        )}
      </form>
      <Link href={desk} className="text-center text-[13px] text-muted">
        {t("backToDesk")}
      </Link>
    </div>
  );
}
