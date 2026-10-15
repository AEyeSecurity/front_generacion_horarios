import { apiErrorPayload } from "@/lib/api-error-contract";
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken, getRefreshToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!code || code === "undefined") {
    return NextResponse.json(
      apiErrorPayload({ error: "bad_request", detail: "Missing or invalid grid code in route param." }, 400),
      { status: 400 }
    );
  }

  const access = await getAccessToken();
  if (!access) return NextResponse.json(apiErrorPayload({ error: "unauthenticated" }, 401), { status: 401 });

  const fetchWithToken = async (token: string) => {
    const headers: HeadersInit = {
      Authorization: `Bearer ${token}`,
      cookie: req.headers.get("cookie") || "",
    };

    const encoded = encodeURIComponent(code);
    return fetch(`${B}/api/grids/code/${encoded}/`, { headers, cache: "no-store" });
  };

  let res = await fetchWithToken(access);
  if (res.status === 401) {
    const refresh = await getRefreshToken();
    if (!refresh) return NextResponse.json(apiErrorPayload({ error: "unauthenticated" }, 401), { status: 401 });

    const rf = await fetch(`${B}/api/auth/refresh/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh }),
      cache: "no-store",
    });
    if (!rf.ok) return NextResponse.json(apiErrorPayload({ error: "refresh_failed" }, 401), { status: 401 });
    const { access: newAccess } = await rf.json();
    res = await fetchWithToken(newAccess);
  }

  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
