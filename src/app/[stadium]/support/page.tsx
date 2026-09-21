import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStadiumMenu } from "@/lib/queries/stadium";

type Props = { params: Promise<{ stadium: string }> };

export const revalidate = 60;
export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium } = await params;
  const menu = await getStadiumMenu(stadium);
  if (!menu) return { title: "Support" };
  return {
    title: `Support · ${menu.name}`,
    description: `Help with orders at ${menu.name}.`,
  };
}

const TOPICS = [
  {
    title: "Where is my order?",
    body: "Open Order history and tap the live order to see the tracker, ETA, and the four-digit hand-off code.",
  },
  {
    title: "Wrong seat or stand",
    body: "Change your seat from the chip on the shop before you pay. After pay, tell the runner with a note on the tracker.",
  },
  {
    title: "Payment",
    body: "Charges are taken when you confirm. Wallet and card are both simulated in this build — nothing is billed.",
  },
  {
    title: "Allergies",
    body: "Add a note on the line in your cart, or a runner note after you pay. Kitchens read both.",
  },
];

export default async function SupportPage({ params }: Props) {
  const { stadium: slug } = await params;
  const menu = await getStadiumMenu(slug);
  if (!menu) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6 pb-16">
      <header className="pr-12">
        <Link
          href={`/${menu.slug}`}
          className="inline-flex items-center gap-1 text-[13px] text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          <span aria-hidden>←</span> Menu
        </Link>
        <h1 className="font-display mt-3 text-[28px] font-semibold leading-none tracking-[-0.03em]">
          Support
        </h1>
        <p className="mt-2 text-[15px] text-muted">{menu.name}</p>
      </header>

      <ul className="mt-6 flex flex-col gap-2">
        {TOPICS.map((topic) => (
          <li key={topic.title} className="rounded-[20px] border border-border bg-surface px-5 py-4">
            <h2 className="text-[15px] font-medium">{topic.title}</h2>
            <p className="mt-1 text-[13px] leading-snug text-muted">{topic.body}</p>
          </li>
        ))}
      </ul>

      <a
        href="mailto:support@seatservice.app"
        className="button button--secondary button--lg mt-6 w-full text-center"
      >
        Email support
      </a>
    </main>
  );
}
