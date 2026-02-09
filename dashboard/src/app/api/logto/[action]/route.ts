import { logtoConfig } from "@/lib/logto";
import { signIn, signOut } from "@logto/next/server-actions";
import { type NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;

  switch (action) {
    case "sign-in":
      return signIn(logtoConfig);
    case "sign-out":
      return signOut(logtoConfig);
    default:
      return new Response("Not Found", { status: 404 });
  }
}
