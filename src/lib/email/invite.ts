import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { hashPassword } from "better-auth/crypto";
import type { Locale } from "@/i18n/config";
import { withDb } from "@/lib/db";
import { emailCopy, fill } from "./copy";
import { renderEmail } from "./html";
import { appOrigin } from "./request-locale";
import { sendMail } from "./send";

/** Create a sign-in for this address if one does not exist yet. The public sign-up form stays closed. */
export async function ensureStaffUser(email: string, name: string): Promise<string> {
  const existing = await withDb((db) => db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } }));
  if (existing) return existing.id;

  const id = randomUUID();
  const password = await hashPassword(randomBytes(24).toString("base64url"));
  try {
    await withDb((db) =>
      db.user.create({
        data: {
          id,
          name,
          email,
          emailVerified: false,
          accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password } },
        },
      }),
    );
    return id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await withDb((db) => db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } }));
      if (again) return again.id;
    }
    throw error;
  }
}

/** Link the reset page understands. Better Auth stores the token as `reset-password:<token>`. */
export async function passwordSetupLink(userId: string, callbackPath: string, hours: number): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await withDb((db) =>
    db.verification.create({
      data: {
        id: randomUUID(),
        identifier: `reset-password:${token}`,
        value: userId,
        expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
      },
    }),
  );
  return `${appOrigin()}/reset-password/${token}?callbackURL=${encodeURIComponent(callbackPath)}`;
}

export async function sendInviteEmail(opts: { to: string; name: string; stadiumName: string; stadiumSlug: string; role: string; locale: Locale }) {
  const userId = await ensureStaffUser(opts.to, opts.name);
  const url = await passwordSetupLink(userId, `/${opts.stadiumSlug}/management/login`, 24);
  const copy = emailCopy(opts.locale);
  const vars = { name: opts.name, stadium: opts.stadiumName, role: opts.role, email: opts.to };
  const sent = await sendMail({
    to: opts.to,
    subject: fill(copy.invite.subject, vars, "text"),
    html: renderEmail({
      locale: opts.locale,
      preheader: fill(copy.invite.preheader, vars, "html"),
      heading: fill(copy.invite.heading, vars, "html"),
      paragraphs: [fill(copy.invite.body, vars, "html")],
      action: { href: url, label: copy.invite.action },
      footer: fill(copy.invite.ignore, vars, "html"),
    }),
    idempotencyKey: `invite/${opts.stadiumSlug}/${opts.to}/${url}`,
  });
  if (!sent.ok) return sent;
  return { ok: true, userId };
}
