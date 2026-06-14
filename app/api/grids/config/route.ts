import { NextResponse } from "next/server";
import { ApiError } from "@/lib/errors";
import { backendFetchJSON } from "@/lib/backend";

export async function GET() {
  try {
    const data = await backendFetchJSON<unknown>("/api/grids/config/");
    return NextResponse.json(data);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const detail = error instanceof Error ? error.message : "Could not load grid configuration.";
    return NextResponse.json({ detail }, { status });
  }
}
