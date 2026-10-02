import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function kitchenSession() {
  return auth.api.getSession({ headers: await headers() });
}
