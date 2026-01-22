import { handleSignIn, signIn, signOut } from "@logto/next/server-actions";
import { logtoConfig } from "@/lib/logto";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  const searchParams = request.nextUrl.searchParams;

  switch (action) {
    case "sign-in":
      await signIn(logtoConfig);
      break;
    case "sign-out":
      await signOut(logtoConfig);
      break;
    case "callback":
      await handleSignIn(logtoConfig, searchParams);
      redirect("/");
      break;
    default:
      return new Response("Not Found", { status: 404 });
  }
}
