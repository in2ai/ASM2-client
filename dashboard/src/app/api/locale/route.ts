import { isAppLocale, localeCookieName } from "@/i18n/config";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    locale?: string;
  } | null;

  if (!payload?.locale || !isAppLocale(payload.locale)) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, payload.locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  return NextResponse.json({ ok: true });
}
