import 'server-only';
import { cookies } from 'next/headers';

const ACCESS = process.env.AUTH_ACCESS_COOKIE!;
const REFRESH = process.env.AUTH_REFRESH_COOKIE!;

export async function getAccessToken() {
  return (await cookies()).get(ACCESS)?.value;
}
export async function getRefreshToken() {
  return (await cookies()).get(REFRESH)?.value;
}
