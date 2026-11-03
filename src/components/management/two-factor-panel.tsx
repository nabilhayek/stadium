"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import QRCode from "react-qr-code";
import { Check, Copy, Download, ShieldCheck } from "lucide-react";
import { twoFactor } from "@/lib/auth-client";
import { useToast } from "@/components/toast/toast-provider";

/** `page` is the standalone sign-in setup screen; `desk` sits inside the Account settings card. */
type Props = { stadiumSlug: string; enabled: boolean; locked: boolean; required: boolean; variant?: "page" | "desk" };
type Step = "idle" | "scan" | "codes";

const STYLES = {
  page: {
    field: "input input--secondary mt-1.5 min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[15px]",
    label: "text-[11px] font-medium uppercase tracking-[0.14em] text-muted",
    title: "text-[17px] font-semibold",
    lead: "text-[14px] text-muted",
    box: "rounded-2xl border border-border",
    codes: "rounded-2xl border border-border bg-background",
    primary: "button button--primary button--lg w-full",
    secondary: "button button--secondary",
  },
  desk: {
    field:
      "mt-1.5 h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-[14px] text-neutral-900 outline-none transition-[border-color,box-shadow] focus-visible:border-blue-500 focus-visible:ring-3 focus-visible:ring-blue-500/15",
    label: "text-[13px] font-medium text-neutral-700",
    title: "text-[15px] font-semibold",
    lead: "text-[13px] leading-snug text-neutral-500",
    box: "rounded-lg border border-neutral-200",
    codes: "rounded-lg border border-neutral-200 bg-neutral-50",
    primary:
      "inline-flex h-9 w-fit items-center justify-center gap-1.5 rounded-full bg-neutral-900! px-4 text-[14px] font-medium text-white! transition-colors duration-150 hover:bg-neutral-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50",
    secondary:
      "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-neutral-200 bg-white! px-4 text-[14px] font-medium transition-colors duration-150 hover:bg-neutral-50! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50",
  },
} as const;

export function TwoFactorPanel({ stadiumSlug, enabled, locked, required, variant = "page" }: Props) {
  const S = STYLES[variant];
  const desk = variant === "desk";
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
  const deskHref = `/${stadiumSlug}/management`;
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
    if (desk) {
      setStep("idle");
      setCodes([]);
      setUri("");
      setCode("");
    } else router.push(deskHref);
    router.refresh();
  }

  if (step === "codes") {
    return (
      <div className="flex flex-col gap-4">
        <h2 className={S.title}>{t("codesTitle")}</h2>
        <p className={S.lead}>{t("codesLead")}</p>
        <ul className={`grid grid-cols-2 gap-2 p-4 font-mono text-[14px] tabular-nums ${S.codes}`}>
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button type="button" onClick={copy} className={`${S.secondary} flex-1`}>
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? t("copied") : t("copy")}
          </button>
          <button type="button" onClick={download} className={`${S.secondary} flex-1`}>
            <Download className="size-4" aria-hidden />
            {t("download")}
          </button>
        </div>
        <button type="button" onClick={finish} className={S.primary}>
          {t("savedThem")}
        </button>
      </div>
    );
  }

  if (step === "scan") {
    return (
      <form onSubmit={confirm} className="flex flex-col gap-4">
        <h2 className={S.title}>{t("scanTitle")}</h2>
        <p className={S.lead}>{t("scanLead")}</p>
        <div className={`self-center bg-white p-4 ${S.box}`}>
          <QRCode value={uri} size={176} />
        </div>
        {secret ? (
          <p className={desk ? "text-center text-[12px] text-neutral-500" : "text-center text-[12px] text-muted"}>
            {t("manualKey")} <span className="font-mono tracking-wider break-all text-neutral-900">{secret}</span>
          </p>
        ) : null}
        <label className="block">
          <span className={S.label}>{t("enterCode")}</span>
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            className={`${S.field} tracking-[0.3em] tabular-nums`}
          />
        </label>
        <button type="submit" disabled={pending} className={S.primary}>
          {pending ? t("pleaseWait") : t("confirm")}
        </button>
      </form>
    );
  }

  if (!enabled) {
    return (
      <form onSubmit={start} className="flex flex-col gap-4">
        <h2 className={S.title}>{t("setupTitle")}</h2>
        <p className={S.lead}>{required ? t("requiredLead") : t("setupLead")}</p>
        <label className="block">
          <span className={S.label}>{t("password")}</span>
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={S.field} />
        </label>
        <button type="submit" disabled={pending} className={S.primary}>
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
      <form onSubmit={regenerate} className={`flex flex-col gap-3 p-4 ${S.box}`}>
        <p className={S.lead}>{t("manageLead")}</p>
        <label className="block">
          <span className={S.label}>{t("password")}</span>
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={S.field} />
        </label>
        <button type="submit" disabled={pending} className={desk ? `${S.secondary} w-fit` : `${S.secondary} w-full`}>
          {t("newBackupCodes")}
        </button>
        {locked ? (
          <p className={desk ? "text-[13px] text-neutral-500" : "text-[13px] text-muted"}>{t("lockedNote")}</p>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={turnOff}
            className={desk ? "w-fit text-[13px] font-medium text-red-600 hover:underline" : "text-[13px] text-red-600"}
          >
            {t("turnOff")}
          </button>
        )}
      </form>
      {desk ? null : (
        <Link href={deskHref} className="text-center text-[13px] text-muted">
          {t("backToDesk")}
        </Link>
      )}
    </div>
  );
}
