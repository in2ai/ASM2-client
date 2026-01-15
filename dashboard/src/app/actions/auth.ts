"use server";

import { env } from "@/env";
import { signOut } from "@workos-inc/authkit-nextjs";

export async function signOutAction() {
  console.log("🚀 ~ signOutAction ~ env.NEXT_PUBLIC_APP_URL:", env.NEXT_PUBLIC_APP_URL)
  await signOut({ returnTo: env.NEXT_PUBLIC_APP_URL + "/sign-in" });
}
