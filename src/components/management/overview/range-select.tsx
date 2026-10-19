"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = { value: string; options: { value: string; label: string }[] };

export function RangeSelect({ value, options }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    const query = new URLSearchParams(params.toString());
    query.set("range", next);
    startTransition(() => router.replace(`${pathname}?${query.toString()}`, { scroll: false }));
  }

  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger aria-label="Time range" className={cn("w-44", pending && "opacity-60")}>
        <Clock className="size-4" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
