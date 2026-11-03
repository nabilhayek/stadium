"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Lock } from "lucide-react";

/** A desk page this person's role doesn't include (`requireVenue` → `forbidden()`). Answers 403. */
export default function DeskForbidden() {
  const { stadium } = useParams<{ stadium: string }>();
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 px-4 py-16 text-center">
      <Lock className="size-5 text-neutral-400" aria-hidden />
      <h1 className="text-[15px] font-semibold">Your role doesn&apos;t include this page</h1>
      <p className="max-w-sm text-[13px] text-neutral-500">Ask an admin at this venue to change your role if you need it.</p>
      <Link
        href={`/${stadium}/management`}
        className="mt-2 inline-flex h-8 items-center rounded-full bg-neutral-900! px-3.5 text-[13px] font-medium text-white! hover:bg-neutral-700!"
      >
        Back to the overview
      </Link>
    </div>
  );
}
