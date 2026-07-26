import { NextResponse } from "next/server";
import { hashSecret, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const token = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]+)`))?.[1];
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashSecret(decodeURIComponent(token)) } });
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
