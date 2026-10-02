import type { ReactNode } from "react";
import { StadiumFrame } from "@/components/stadium-frame";

type Props = {
  children: ReactNode;
  params: Promise<{ stadium: string }>;
};

export default async function StadiumLayout({ children, params }: Props) {
  const { stadium } = await params;
  return <StadiumFrame stadiumSlug={stadium}>{children}</StadiumFrame>;
}
