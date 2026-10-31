import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-start justify-center px-4">
      <h1 className="text-4xl font-semibold leading-none tracking-tighter">Not found</h1>
      <p className="mt-3 text-muted">This venue isn&apos;t on Seat Service, or the link has expired.</p>
      <Link href="/" className="mt-8 text-link underline-offset-4 hover:underline">
        All venues
      </Link>
    </main>
  );
}
