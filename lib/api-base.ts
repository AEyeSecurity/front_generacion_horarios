export function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";
  if (!base) {
    throw new Error("Missing API base URL. Set NEXT_PUBLIC_BACKEND_URL or NEXT_PUBLIC_API_URL.");
  }
  return base;
}

export function getApiBaseUrlNormalized(): string {
  return getApiBaseUrl().replace(/\/$/, "");
}

