import { expect, test, type Page } from "@playwright/test";
import {
  cleanupResources, createTestGrid, ensureAuthenticated, newResourceTracker,
  requestJson, type CreatedGrid,
} from "./e2e-helpers";

test.skip(({ browserName }) => browserName !== "chromium", "Run mutating sharing checks once.");
test.setTimeout(180_000);

type Invite = { id: number; grid_id: number; token: string; active: boolean; type: string; status: string };
const share = (page: Page) => page.getByRole("button", { name: /^(Share|Compartir)$/ });
const dialog = (page: Page) => page.getByRole("dialog");
const save = (page: Page) => dialog(page).getByRole("button", { name: /^(Save changes|Guardar cambios)$/ });
const copy = (page: Page) => dialog(page).getByRole("button", { name: /^(Copy URL|Copiar URL)$/ });
const activate = (page: Page) => dialog(page).getByRole("button", { name: /^(Activate URL|Activar URL)$/ });
const deactivate = (page: Page) => dialog(page).getByRole("button", { name: /^(Deactivate URL|Desactivar URL)$/ });
const close = (page: Page) => dialog(page).getByRole("button", { name: /^(Close|Cerrar)$/, exact: true }).last();

async function openGrid(page: Page, grid: CreatedGrid) {
  await page.goto(`/grid/${grid.code}`);
  await share(page).click();
  await expect(dialog(page)).toBeVisible();
}

async function links(page: Page, gridId: number) {
  const body = await requestJson<Invite[] | { results: Invite[] }>(page, "GET", `/api/invitations/?grid=${gridId}`);
  const rows = Array.isArray(body) ? body : body.results;
  expect(rows.every((row) => row.grid_id === gridId)).toBe(true);
  return rows;
}

async function enable(page: Page, gridId: number) {
  await expect(activate(page)).toBeEnabled();
  await expect(save(page)).toBeDisabled();
  await expect(copy(page)).toBeDisabled();
  await activate(page).click();
  await expect(copy(page)).toBeDisabled(); // No unsaved token may be copied.
  await expect(save(page)).toBeEnabled();
  await save(page).click();
  await expect(copy(page)).toBeEnabled();
  await expect(save(page)).toBeDisabled();
  const active = (await links(page, gridId)).filter((row) => row.type === "link" && row.active);
  expect(active).toHaveLength(1);
  return active[0];
}

async function assertCopied(page: Page, invite: Invite) {
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await copy(page).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${new URL(page.url()).origin}/invite/${invite.token}`,
  );
  const resolved = await requestJson<Invite>(page, "GET", `/api/invitations/resolve/?token=${invite.token}`);
  expect(resolved.grid_id).toBe(invite.grid_id);
  expect(resolved.id).toBe(invite.id);
  expect(resolved.active).toBe(true);
}

test("new Grid sharing data completes on the first modal open", async ({ page }) => {
  const resources = newResourceTracker();
  await ensureAuthenticated(page);
  try {
    const grid = await createTestGrid(page, resources, "Immediate sharing");
    await page.goto(`/grid/${grid.code}`);

    const resourceResponses = Promise.all([
      page.waitForResponse((response) => response.url().includes(`/api/grid_memberships/?grid=${grid.id}`)),
      page.waitForResponse((response) => response.url().includes(`/api/participants?grid=${grid.id}`)),
      page.waitForResponse((response) => response.url().includes(`/api/grids/${grid.id}`)),
      page.waitForResponse((response) => response.url().includes(`/api/invitations/?grid=${grid.id}`)),
    ]);

    await share(page).click();
    await expect(dialog(page)).toBeVisible();
    const responses = await resourceResponses;
    expect(responses.every((response) => response.ok())).toBe(true);
    await expect(dialog(page).getByText(/^(Loading|Cargando)(\.\.\.)?$/)).toHaveCount(0);
    await expect(activate(page)).toBeEnabled();
  } finally {
    await cleanupResources(page, resources);
  }
});

test("two owned Grids keep persisted links isolated across copying, revocation and reactivation", async ({ page, context, browser, baseURL }) => {
  const aResources = newResourceTracker();
  const bResources = newResourceTracker();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await ensureAuthenticated(page);
  const anonymous = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const a = await createTestGrid(page, aResources, "a");
    const b = await createTestGrid(page, bResources, "Laboral");
    await openGrid(page, a);
    const first = await enable(page, a.id);
    await assertCopied(page, first);
    await close(page).click();
    await openGrid(page, b);
    const laboral = await enable(page, b.id); // Newest invitation belongs to Laboral.
    expect(laboral.token).not.toBe(first.token);
    await assertCopied(page, laboral);
    await close(page).click();
    await openGrid(page, a);
    await expect(copy(page)).toBeEnabled();
    await expect(save(page)).toBeDisabled();
    await assertCopied(page, first); // Original cross-Grid regression.

    await deactivate(page).click();
    await expect(copy(page)).toBeDisabled();
    await expect(save(page)).toBeEnabled();
    await close(page).click(); // Discard draft, do not revoke.
    await share(page).click();
    await expect(copy(page)).toBeEnabled();
    await expect(save(page)).toBeDisabled();
    await assertCopied(page, first);

    // A sibling created after modal loading must also be revoked by Save.
    const sibling = await requestJson<Invite>(page, "POST", "/api/invitations/", { grid: a.id, type: "link", role: "viewer" });
    const direct = await requestJson<Invite>(page, "POST", "/api/invitations/", {
      grid: a.id, type: "email", role: "viewer", email: "sharing-direct@example.invalid",
    });
    const memberships = await requestJson(page, "GET", `/api/grid_memberships/?grid=${a.id}`);
    expect((await anonymous.request.post("/api/invitations/revoke-links/", { data: { grid: a.id } })).status()).toBe(401);
    await deactivate(page).click();
    // A long-open modal can outlive its access token; the BFF must refresh it.
    const accessCookie = (await context.cookies()).find((cookie) => cookie.name.endsWith("_access"));
    expect(accessCookie).toBeTruthy();
    await context.addCookies([{ ...accessCookie!, value: "expired-access-token" }]);
    await save(page).click();
    await expect(activate(page)).toBeEnabled();
    await expect(copy(page)).toBeDisabled();
    await expect(save(page)).toBeDisabled();
    expect((await context.cookies()).find((cookie) => cookie.name === accessCookie!.name)?.value).not.toBe("expired-access-token");
    for (const old of [first, sibling]) {
      for (const api of [page.request, anonymous.request]) {
        expect((await api.get(`/api/invitations/resolve/?token=${old.token}`)).status()).toBe(400);
        expect((await api.post("/api/invitations/accept/", { data: { token: old.token } })).status()).toBe(400);
      }
    }
    const visitor = await anonymous.newPage();
    const rejectedLookup = visitor.waitForResponse((res) => res.url().includes(`/api/invitations/resolve?token=${first.token}`));
    await visitor.goto(`/invite/${first.token}`);
    expect((await rejectedLookup).status()).toBe(400);
    await expect(visitor.getByText(/Invitation could not be loaded|No se pudo cargar la invitación/i)).toBeVisible();
    await expect(visitor.getByRole("button", { name: /Join Grid|Unirse a la grilla/i })).toHaveCount(0);
    expect((await links(page, a.id)).find((row) => row.id === direct.id)?.active).toBe(true);
    expect(await requestJson(page, "GET", `/api/grid_memberships/?grid=${a.id}`)).toEqual(memberships);
    expect((await links(page, b.id)).find((row) => row.id === laboral.id)?.active).toBe(true);

    await close(page).click();
    await share(page).click();
    const fresh = await enable(page, a.id);
    expect([first.token, sibling.token, laboral.token]).not.toContain(fresh.token);
    await assertCopied(page, fresh);
    await close(page).click();
    await share(page).click();
    await expect(copy(page)).toBeEnabled();
    await assertCopied(page, fresh);
    expect((await anonymous.request.get(`/api/invitations/resolve/?token=${first.token}`)).status()).toBe(400);

    // External revocation while the modal is open must not copy a stale URL.
    await requestJson(page, "POST", "/api/invitations/revoke-links/", { grid: a.id });
    await page.evaluate(() => navigator.clipboard.writeText("unchanged"));
    await copy(page).click();
    await expect(activate(page)).toBeEnabled();
    await expect(copy(page)).toBeDisabled();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("unchanged");
    await close(page).click();
    await openGrid(page, b);
    await expect(copy(page)).toBeEnabled();
    await assertCopied(page, laboral);
  } finally {
    await anonymous.close();
    await cleanupResources(page, aResources);
    await cleanupResources(page, bResources);
  }
});

test("loading, failed reads and late responses never masquerade as saved sharing state", async ({ page }) => {
  const resources = newResourceTracker();
  await ensureAuthenticated(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let captured!: () => void;
  const fetched = new Promise<void>((resolve) => { captured = resolve; });
  try {
    const grid = await createTestGrid(page, resources, "Sharing race");
    const original = await requestJson<Invite>(page, "POST", "/api/invitations/", { grid: grid.id, type: "link", role: "viewer" });
    let first = true;
    await page.route(/\/api\/invitations\/?\?grid=/, async (route) => {
      if (!first) return route.continue();
      first = false;
      const response = await route.fetch(); // Real BFF/Django response, delayed delivery.
      captured();
      await held;
      await route.fulfill({ response }).catch(() => {}); // The old modal may have aborted it.
    });
    await openGrid(page, grid);
    await fetched;
    await expect(activate(page)).toBeDisabled();
    await expect(save(page)).toBeDisabled();
    await expect(copy(page)).toBeDisabled();
    await expect(dialog(page).getByText(/^(General link disabled|Link general deshabilitado)$/)).toHaveCount(0);
    await close(page).click();
    await requestJson(page, "POST", "/api/invitations/revoke-links/", { grid: grid.id });
    await share(page).click();
    await expect(activate(page)).toBeEnabled();
    release();
    await expect(copy(page)).toBeDisabled();
    await expect(save(page)).toBeDisabled();
    await expect(activate(page)).toBeEnabled();
    expect((await links(page, grid.id)).find((row) => row.id === original.id)?.active).toBe(false);
    await close(page).click();
    await page.unrouteAll({ behavior: "wait" });

    await page.route(/\/api\/invitations\/?\?grid=/, (route) => route.fulfill({
      status: 503, contentType: "application/json", body: '{"code":"UPSTREAM_UNAVAILABLE"}',
    }));
    await share(page).click();
    await expect(dialog(page).getByText(/Could not load sharing data|No se pudo cargar la informacion para compartir/i).first()).toBeVisible();
    await expect(activate(page)).toBeDisabled();
    await expect(save(page)).toBeDisabled();
    await expect(copy(page)).toBeDisabled();
    await close(page).click();
    await page.unrouteAll({ behavior: "wait" });
    await share(page).click();
    await enable(page, grid.id);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await cleanupResources(page, resources);
  }
});
