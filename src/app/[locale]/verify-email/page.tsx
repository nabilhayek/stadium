import { redirect } from "next/navigation";
import { connection } from "next/server";

type Props = { searchParams: Promise<{ token?: string; callbackURL?: string }> };

/** Better Auth emails this path. The API at `/api/auth/verify-email` is what actually marks the address. */
export const instant = false;

export default async function VerifyEmailPage({ searchParams }: Props) {
  await connection();
  const { token, callbackURL } = await searchParams;
  if (!token) redirect("/");
  const query = new URLSearchParams({ token });
  if (callbackURL) query.set("callbackURL", callbackURL);
  redirect(`/api/auth/verify-email?${query.toString()}`);
}
