import { test, expect } from '@playwright/test';

// Backfills the manually-verified SHOP checklist (renderShopPage/
// productCardHTML, the Shop page's product cards and detail modal). Relies
// on real product data in the target Firebase project — creating a
// throwaway product would mean driving SHOP MANAGEMENT (business users),
// a separate, still-unconverted cluster, so this discovers what's actually
// there and skips with a clear message rather than assuming a fixture
// exists, same convention as tests/people-filters.spec.js.
//
// handleBuy's real click isn't exercised here — it does a real
// window.open()/mailto: navigation depending on the product's own data, not
// something to fire against real products in an automated run. Its
// data-onclick/data-args wiring is asserted directly instead, same
// approach as the Send button in tests/share-and-saved.spec.js.

async function gotoShopPage(page) {
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await expect(page.locator('#page-shop')).toHaveClass(/active/);
  // showPage('shop') fires renderShopPage() which awaits loadProducts() — the
  // page is "active" before the grid fills. Wait for the grid to settle
  // (a card or the empty state) so the first test doesn't race a cold load.
  await page.locator('#shopPageGrid .product-card, #shopPageGrid .empty-state').first()
    .waitFor({ timeout: 10_000 }).catch(() => {});
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });
  await gotoShopPage(page);
});

test('clicking a product card opens the detail modal with matching content', async ({ page }) => {
  const card = page.locator('#shopPageGrid .product-card').first();
  test.skip((await card.count()) === 0, 'No shop products in the target Firebase project.');

  const name = await card.locator('.product-card-name').innerText();
  await card.locator('.product-card-image').click();

  await expect(page.locator('#productDetailModal')).toHaveClass(/open/);
  await expect(page.locator('#productDetailTitle')).toHaveText(name);

  await page.locator('[data-onclick="closeProductDetailModal"]').click();
  await expect(page.locator('#productDetailModal')).not.toHaveClass(/open/);
});

test('clicking a card\'s bakery link opens the bakery modal, not the product detail', async ({ page }) => {
  const card = page.locator('#shopPageGrid .product-card').filter({ has: page.locator('.product-card-bakery') }).first();
  test.skip((await card.count()) === 0, 'No shop products with a visible bakery link to test.');

  await card.locator('.product-card-bakery').click();
  await expect(page.locator('#bakeryModal')).toHaveClass(/open/);
  await expect(page.locator('#productDetailModal')).not.toHaveClass(/open/);
});

test('an available product\'s Buy button (card and detail modal) is wired to handleBuy with the right id', async ({ page }) => {
  const card = page.locator('#shopPageGrid .product-card:not(.product-unavailable)').first();
  test.skip((await card.count()) === 0, 'No available (non-sold-out) shop products to test the Buy button on.');

  const cardBuyBtn = card.locator('.product-buy-btn');
  await expect(cardBuyBtn).toHaveAttribute('data-onclick', 'handleBuy');
  const productId = JSON.parse(await cardBuyBtn.getAttribute('data-args'))[0];
  expect(typeof productId).toBe('string');
  expect(productId.length).toBeGreaterThan(0);

  await card.locator('.product-card-image').click();
  await expect(page.locator('#productDetailModal')).toHaveClass(/open/);
  const modalBuyBtn = page.locator('#productDetailContent .product-buy-btn');
  await expect(modalBuyBtn).toHaveAttribute('data-onclick', 'handleBuy');
  const modalProductId = JSON.parse(await modalBuyBtn.getAttribute('data-args'))[0];
  expect(modalProductId).toBe(productId);
});

test('filters narrow the grid and the result count reflects it', async ({ page }) => {
  const initialCount = await page.locator('#shopPageGrid .product-card').count();
  test.skip(initialCount === 0, 'No shop products to filter.');

  const bakeryOptions = await page.locator('#shopFilterBakery option').all();
  test.skip(bakeryOptions.length < 2, 'Only one bakery has shop products — nothing to narrow by.');

  const value = await bakeryOptions[1].getAttribute('value');
  await page.locator('#shopFilterBakery').selectOption(value);

  const filteredCount = await page.locator('#shopPageGrid .product-card').count();
  expect(filteredCount).toBeGreaterThan(0);
  expect(filteredCount).toBeLessThanOrEqual(initialCount);
  await expect(page.locator('#shopResultCount')).toHaveText(`${filteredCount} item${filteredCount !== 1 ? 's' : ''}`);

  await page.locator('#shopFilterBakery').selectOption('');
  await expect(page.locator('#shopPageGrid .product-card')).toHaveCount(initialCount);
});
