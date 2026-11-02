import "server-only";
import webpush from "web-push";
import { withDb } from "@/lib/db";

export type PushTarget = { id: string; endpoint: string; p256dh: string; auth: string };

export type PushMessage = { title: string; body: string; url: string; tag: string };

export type PushOptions = {
  /** Seconds the push service keeps the message for an offline phone. */
  ttl: number;
  urgency: "normal" | "high";
  /** A newer message with the same topic replaces one still waiting in the push service. */
  topic?: string;
};

export type SentPush = { endpoint: string; message: PushMessage; options: PushOptions };

/** Delivers one message. Throws an error with `statusCode` when the push service refuses it. */
export type PushTransport = (target: PushTarget, payload: string, options: PushOptions) => Promise<void>;

const SUBJECT = "mailto:orders@seatize.com";

const captured: SentPush[] = [];

/** Pushes recorded while tests are running, instead of calling a push service. */
export function takeSentPushes(): SentPush[] {
  return captured.splice(0, captured.length);
}

function defaultTransport(): PushTransport | null {
  if (process.env.VITEST === "true") {
    return async (target, payload, options) => {
      captured.push({ endpoint: target.endpoint, message: JSON.parse(payload) as PushMessage, options });
    };
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return async (target, payload, options) => {
    await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
      vapidDetails: { subject: SUBJECT, publicKey, privateKey },
      TTL: options.ttl,
      urgency: options.urgency,
      ...(options.topic ? { topic: options.topic } : {}),
    });
  };
}

/** Sends to every target and returns the ids whose subscription no longer exists (404 or 410). */
export async function deliver(targets: PushTarget[], message: PushMessage, options: PushOptions, transport: PushTransport): Promise<string[]> {
  const payload = JSON.stringify(message);
  const gone: string[] = [];
  await Promise.all(
    targets.map(async (target) => {
      try {
        await transport(target, payload, options);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(target.id);
        else console.error("Push failed.", status ?? error);
      }
    }),
  );
  return gone;
}

/** Sends one message to every target and forgets the subscriptions the push service has dropped. */
export async function sendPush(targets: PushTarget[], message: PushMessage, options: PushOptions): Promise<void> {
  if (targets.length === 0) return;
  const transport = defaultTransport();
  if (!transport) return;
  const gone = await deliver(targets, message, options, transport);
  if (gone.length) await withDb((db) => db.pushSubscription.deleteMany({ where: { id: { in: gone } } }));
}

/** Topics allow 32 URL-safe base64 characters. */
export function pushTopic(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32);
}
