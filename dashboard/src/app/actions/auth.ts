"use server";

import { env } from "@/env";
import { signOut } from "@workos-inc/authkit-nextjs";

export async function signOutAction() {
  await signOut({ returnTo: env.NEXT_PUBLIC_APP_URL + "/sign-in" });
}
