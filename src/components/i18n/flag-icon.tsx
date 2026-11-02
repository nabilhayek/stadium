import { cn } from "@/lib/utils";
import "@/styles/flag-icons-subset.css";

type Props = {
  code: string;
  /** Square 1:1 instead of 4:3. */
  square?: boolean;
  className?: string;
  title?: string;
};

/** Inline flag from flag-icons (subset CSS). */
export function FlagIcon({ code, square, className, title }: Props) {
  const iso = code.toLowerCase();
  return (
    <span
      className={cn("fi shrink-0 overflow-hidden rounded-[2px]", square && "fis", `fi-${iso}`, className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
    />
  );
}
