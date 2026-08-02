import { NextResponse } from "next/server";
import { authenticateMiniRequest } from "@/lib/mini-auth";
import { prisma } from "@/lib/prisma";

const allowed = new Set(["app_open", "feed_refresh", "article_open", "offline_save", "sync_complete", "push_enabled"]);
export async function POST(request: Request) { const auth = await authenticateMiniRequest(request); if (!auth) return new NextResponse(null, { status: 204 }); const body = await request.json().catch(() => null); if (!allowed.has(body?.name)) return NextResponse.json({ error: "invalid event" }, { status: 400 }); const entries = body?.properties && typeof body.properties === "object" ? Object.entries(body.properties).slice(0, 20).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).map(([key, value]) => [key.slice(0, 50), typeof value === "string" ? value.slice(0, 200) : value]) : []; await prisma.behaviorEvent.create({ data: { userId: auth.user.id, action: `mobile_${body.name}`, metadata: Object.fromEntries(entries) } }); return new NextResponse(null, { status: 204 }); }
