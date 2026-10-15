import { apiErrorPayload } from "@/lib/api-error-contract";
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { gridCellFormOptionsPath } from "@/lib/cell-api";
import { getAccessToken } from "@/lib/cookies";

const API_BASE = getApiBaseUrlNormalized();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json(apiErrorPayload({ error: "unauthenticated" }, 401), { status: 401 });

  let path: string;
  try {
    path = gridCellFormOptionsPath(id);
  } catch (error) {
    return NextResponse.json(apiErrorPayload({ detail: error instanceof Error ? error.message : "Invalid grid id." }, 400), { status: 400 });
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${access}`,
      cookie: req.headers.get("cookie") || "",
    },
    cache: "no-store",
  });
  const body = await response.text().catch(() => "");

  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
