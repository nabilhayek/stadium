import { Suspense, type ReactNode } from "react";
import { StadiumFrame } from "@/components/stadium-frame";

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
  return <StadiumFrame stadiumSlug={stadium} />;
}
