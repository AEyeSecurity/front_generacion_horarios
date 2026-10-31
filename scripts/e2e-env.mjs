// Fixed, non-secret credentials exist only in the disposable E2E database.
export const isolatedEnv = {
  NEXT_PUBLIC_API_URL: 'http://127.0.0.1:18000',
  AUTH_ACCESS_COOKIE: 'access',
  AUTH_REFRESH_COOKIE: 'refresh',
  AUTH_COOKIE_DOMAIN: '',
  AUTH_COOKIE_SECURE: 'false',
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: '',
  E2E_EMAIL: 'e2e-owner@example.invalid',
  E2E_PASSWORD: 'Shift-E2E-owner-123!',
  E2E_SOLVER_REVIEWER_PASSWORD: 'Shift-E2E-reviewer-123!',
  NEXT_TELEMETRY_DISABLED: '1',
};

export function configureE2E() {
  if (!process.env.E2E_BASE_URL) Object.assign(process.env, isolatedEnv);
}
