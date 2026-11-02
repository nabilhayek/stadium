import { Suspense, type ReactNode } from "react";
import { StadiumFrame } from "@/components/stadium-frame";
import { api } from "@/server/trpc/server";

type Props = {
  children: ReactNode;
  params: Promise<{ stadium: string }>;
};

export default function StadiumLayout({ children, params }: Props) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <StadiumChrome params={params} />
      </Suspense>
    </>
  );
}

async function StadiumChrome({ params }: { params: Promise<{ stadium: string }> }) {
  const { stadium } = await params;
  const menu = await api.stadium.menu({ slug: stadium });
  return <StadiumFrame stadiumSlug={stadium} currency={menu?.currency ?? null} />;
}
