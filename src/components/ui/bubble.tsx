"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type * as React from "react";
import { tv, type VariantProps } from "tailwind-variants";

import { cn } from "@/lib/utils";

function BubbleGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-col gap-2", className)} data-slot="bubble-group" {...props} />;
}

const bubbleVariants = tv({
  base: "group/bubble relative flex w-fit max-w-[85%] min-w-0 flex-col gap-1 data-[align=end]:self-end data-[variant=ghost]:max-w-full group-data-[align=end]/message:self-end",
  defaultVariants: { variant: "default" },
  variants: {
    variant: {
      default: "*:data-[slot=bubble-content]:bg-neutral-900 *:data-[slot=bubble-content]:text-white",
      muted: "*:data-[slot=bubble-content]:bg-neutral-100 *:data-[slot=bubble-content]:text-neutral-900",
      outline: "*:data-[slot=bubble-content]:border-neutral-200 *:data-[slot=bubble-content]:bg-white *:data-[slot=bubble-content]:text-neutral-900",
      destructive: "*:data-[slot=bubble-content]:bg-red-50 *:data-[slot=bubble-content]:text-red-800",
      ghost: "*:data-[slot=bubble-content]:rounded-none *:data-[slot=bubble-content]:bg-transparent *:data-[slot=bubble-content]:p-0 *:data-[slot=bubble-content]:text-neutral-800",
    },
  },
});

function Bubble({
  variant = "default",
  align = "start",
  className,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof bubbleVariants> & {
    /** The side of the conversation it sits on: `start` (theirs) or `end` (yours). */
    align?: "start" | "end";
  }) {
  return <div className={cn(bubbleVariants({ variant }), className)} data-align={align} data-slot="bubble" data-variant={variant} {...props} />;
}

function BubbleContent({ className, render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "w-fit max-w-full min-w-0 overflow-hidden rounded-2xl border border-transparent px-3 py-2 text-[13px] leading-relaxed wrap-break-word group-data-[align=end]/bubble:self-end",
          className,
        ),
      },
      props,
    ),
    render,
    state: { slot: "bubble-content" },
  });
}

export { Bubble, BubbleContent, BubbleGroup };
