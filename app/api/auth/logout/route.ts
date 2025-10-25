import { NextResponse } from 'next/server';

const ACCESS = process.env.AUTH_ACCESS_COOKIE!;
const REFRESH = process.env.AUTH_REFRESH_COOKIE!;

export async function POST() {
  const out = NextResponse.json({ ok: true });
  out.cookies.delete(ACCESS);
  out.cookies.delete(REFRESH);
  return out;
}
