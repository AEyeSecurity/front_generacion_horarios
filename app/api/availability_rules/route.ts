// Proxy: /api/availability_rules  →  BACKEND_URL/api/availability-rules
import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/cookies";

const B = (process.env.BACKEND_URL || "").replace(/\/$/, "");

const hhmm = (t: unknown) => {
  if (typeof t !== "string") return t as any;
  const [h = "00", m = "00"] = t.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
};

export async function GET(req: NextRequest) {
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const qs = req.nextUrl.search || "";
  const res = await fetch(`${B}/api/availability-rules/${qs}`, {
    headers: {
      Authorization: `Bearer ${access}`,
      cookie: req.headers.get("cookie") || "",
    },
    cache: "no-store",
  });

  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const payload = await req.json().catch(() => ({}));
  if (payload?.start_time) payload.start_time = hhmm(payload.start_time);
  if (payload?.end_time) payload.end_time = hhmm(payload.end_time);

  const res = await fetch(`${B}/api/availability-rules/`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${access}`,
      cookie: req.headers.get("cookie") || "",
    },
    body: JSON.stringify(payload),
  });

  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}
