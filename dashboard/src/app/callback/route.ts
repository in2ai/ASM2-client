import { logtoConfig } from "@/lib/logto";
import { handleSignIn } from "@logto/next/server-actions";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  try {
    await handleSignIn(logtoConfig, searchParams);
  } catch (error) {
    console.error("Sign-in error:", error);
    redirect("/api/logto/sign-in");
  }

  redirect("/");
}
