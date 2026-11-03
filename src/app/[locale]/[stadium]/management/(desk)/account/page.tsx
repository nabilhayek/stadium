import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountPrivacy } from "@/components/management/admin/account-privacy";
import { TwoFactorPanel } from "@/components/management/two-factor-panel";
import { Card, PageHeader } from "@/components/management/ui";
import { withDb } from "@/lib/db";
import { requireVenue } from "@/lib/management/session";
import { roleNeedsTwoFactor } from "@/lib/two-factor-policy";
import { api } from "@/server/trpc/server";

type Props = { params: Promise<{ stadium: string }> };

export const metadata: Metadata = { title: "Account" };
export const instant = false;

export default async function ManagementAccountPage({ params }: Props) {
  const { stadium } = await params;
  const menu = await api.stadium.menu({ slug: stadium });
  if (!menu) notFound();
  const { session } = await requireVenue(menu.slug);
  const locked = await withDb((db) => roleNeedsTwoFactor(db, session.user));
  const enabled = Boolean((session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled);

  return (
    <>
      <PageHeader title="Account" description={`Sign-in security and data for ${session.user.email}.`} />
      <div className="mt-5 flex flex-col gap-4">
        <Card
          title="Two-factor sign-in"
          description={locked ? "Required for Admins and Managers." : "Ask for a code from an authenticator app each time you sign in."}
        >
          <div className="max-w-md p-4">
            <TwoFactorPanel variant="desk" stadiumSlug={menu.slug} enabled={enabled} locked={locked} required={locked} />
          </div>
        </Card>
        <AccountPrivacy stadiumSlug={menu.slug} />
      </div>
    </>
  );
}
