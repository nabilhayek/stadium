import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type Props = {
  href: string;
  children: React.ReactNode;
};

export function BackLink({ href, children }: Props) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[13px] text-muted underline-offset-4 hover:text-foreground hover:underline"
    >
      <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden />
      {children}
    </Link>
  );
}
