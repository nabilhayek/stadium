import { permanentRedirect } from "next/navigation";

type Props = { params: Promise<{ stadium: string; orderNumber: string }> };

/** Old receipt address. Orders now live at /[stadium]/order/[orderNumber]. */
export default async function LegacyOrderReceiptPage({ params }: Props) {
  const { stadium, orderNumber } = await params;
  permanentRedirect(`/${stadium}/order/${orderNumber}`);
}
