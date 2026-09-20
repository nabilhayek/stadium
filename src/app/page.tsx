import Link from "next/link";
import { getActiveStadiums } from "@/lib/queries/stadium";

export const revalidate = 60;

/**
 * Fans normally arrive via a QR code straight to /[stadium].
 * This page is a plain fallback / directory.
 */
export default async function HomePage() {
  const stadiums = await getActiveStadiums();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-12">
      <h1 className="text-4xl font-semibold leading-none tracking-tighter">Seat Service</h1>
      <p className="mt-3 text-muted">
        Scan the QR code on your seat to order food and drinks without leaving the game.
      </p>

      <h2 className="mt-12 text-xs font-medium uppercase tracking-wide text-muted">Venues</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {stadiums.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/${s.slug}`}
              prefetch={false}
              className="flex items-center justify-between rounded-2xl bg-surface p-4 transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-focus"
            >
              <span>
                <span className="block font-medium">{s.name}</span>
                {s.city ? <span className="text-sm text-muted">{s.city}</span> : null}
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
