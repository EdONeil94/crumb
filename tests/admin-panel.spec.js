import { test, expect } from '@playwright/test';

// Backfills the manually-verified ADMIN PANEL RENDERERS checklist
// (renderAdminUsersHTML/renderAdminBakeriesHTML, the Settings page's Admin
// Panel section). Only runs anything if the signed-in test account is an
// admin (isAdmin() — see src/legacy-app.js) — skips with a clear message
// otherwise, same convention as tests/people-filters.spec.js for data this
// suite doesn't control.
//
// promoteUser/promptAssignBakery/removeUserRole are NOT clicked here, even
// when a candidate user row exists: unlike the E2E_-prefixed throwaway data
// elsewhere in this suite, the Users tab lists real accounts from the
// target Firebase project, and these three actions grant/revoke real
// admin/business access — not something to exercise against arbitrary real
// users in an automated run. Their data-onclick/data-args wiring is
// asserted directly instead (same approach as the Send button in
// tests/share-and-saved.spec.js). Manually verify an actual promote/assign/
// remove if these need real coverage.

async function gotoSettings(page) {
  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,showPage"]', { hasText: 'Settings' }).click();
  await expect(page.locator('#page-settings')).toHaveClass(/active/);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });

  await gotoSettings(page);

  // openSettingsPage() toggles #settingsAdminCard after an unawaited async
  // role check (loadUserRole()) for non-super-admin accounts, so a plain
  // isVisible() right after navigating could race it — give it a moment.
  let isAdminAccount = true;
  try {
    await expect(page.locator('#settingsAdminCard')).toBeVisible({ timeout: 5_000 });
  } catch {
    isAdminAccount = false;
  }
  test.skip(!isAdminAccount, 'Signed-in test account is not an admin — Admin Panel is not shown. See this spec\'s module comment.');
});

test('Users tab renders rows with correctly-wired action buttons (not clicked — see module comment)', async ({ page }) => {
  await page.locator('#adminTabUsers').click();
  const content = page.locator('#adminTabContent');
  await expect(content.locator('.spinner')).toHaveCount(0);

  const row = content.locator('.admin-user-row').first();
  test.skip((await row.count()) === 0, 'No other users in the target Firebase project to list.');

  const assignBtn = row.locator('[data-onclick="promptAssignBakery"]');
  await expect(assignBtn).toBeVisible();
  const assignArgs = JSON.parse(await assignBtn.getAttribute('data-args'));
  expect(typeof assignArgs[0]).toBe('string');
  expect(assignArgs[0].length).toBeGreaterThan(0);

  const makeAdminBtn = row.locator('[data-onclick="promoteUser"]');
  if (await makeAdminBtn.count()) {
    const args = JSON.parse(await makeAdminBtn.getAttribute('data-args'));
    expect(args).toEqual([assignArgs[0], 'admin', '']);
  }

  const removeRoleBtn = row.locator('[data-onclick="removeUserRole"]');
  if (await removeRoleBtn.count()) {
    const args = JSON.parse(await removeRoleBtn.getAttribute('data-args'));
    expect(args).toEqual([assignArgs[0]]);
  }
});

test('Bakeries tab: View page opens the bakery profile, Edit page opens Manage Bakery', async ({ page }) => {
  await page.locator('#adminTabBakeries').click();
  const content = page.locator('#adminTabContent');
  await expect(content.locator('.spinner')).toHaveCount(0);

  const row = content.locator('.admin-user-row').first();
  test.skip((await row.count()) === 0, 'No bakeries in the target Firebase project to list.');

  await row.locator('[data-onclick="openBakeryProfile"]').click();
  await expect(page.locator('#bakeryModal')).toHaveClass(/open/);
  await page.locator('[data-onclick="closeBakeryModal"]').first().click();
  await expect(page.locator('#bakeryModal')).not.toHaveClass(/open/);

  const editBtn = row.locator('[data-onclick="openManageBakeryModal"]');
  if (await editBtn.count()) {
    await editBtn.click();
    await expect(page.locator('#manageBakeryModal')).toHaveClass(/open/);
    await page.locator('[data-onclick="closeManageBakeryModal"]').first().click();
    await expect(page.locator('#manageBakeryModal')).not.toHaveClass(/open/);
  }
});
