import { escapeHtml } from "./copy";

type Action = { href: string; label: string };

/** One-column letter. The hidden line is the inbox preview. */
export function renderEmail(opts: { locale: string; preheader: string; heading: string; paragraphs: string[]; action?: Action; footer: string }): string {
  const action = opts.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.action.href)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-size:16px;line-height:24px;padding:12px 18px;border-radius:999px">${escapeHtml(opts.action.label)}</a></p>`
    : "";
  const paragraphs = opts.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:24px;color:#111111">${p}</p>`).join("");
  return `<!doctype html>
<html lang="${escapeHtml(opts.locale)}">
<head><meta charset="utf-8"><title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;background:#f6f6f6">
  <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px">
        <tr><td style="padding:32px 28px;font-family:Arial,Helvetica,sans-serif">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:28px;color:#111111">${escapeHtml(opts.heading)}</h1>
          ${paragraphs}
          ${action}
          <p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#666666">${opts.footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
