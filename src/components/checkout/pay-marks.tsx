import Image from "next/image";
import { CreditCard } from "lucide-react";

// Brand SVGs are served as-is: `unoptimized` skips the image pipeline, which can't do anything for vectors.
export function ApplePayMark({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/apple-pay.svg"
      alt=""
      aria-hidden
      width={76}
      height={32}
      unoptimized
      className={["h-8 w-[4.75rem] object-contain object-right", className].filter(Boolean).join(" ")}
    />
  );
}

export function GooglePayMark({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/google-pay.svg"
      alt=""
      aria-hidden
      width={76}
      height={32}
      unoptimized
      className={["h-8 w-[4.75rem] object-contain object-right", className].filter(Boolean).join(" ")}
    />
  );
}

export function CardMark({ className }: { className?: string }) {
  return <CreditCard className={["size-7", className].filter(Boolean).join(" ")} strokeWidth={1.7} aria-hidden />;
}
