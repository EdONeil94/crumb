// ─── SHOP ─────────────────────────────────────────────────────────────────────
// The public Shop page + product cards/detail modal (pages/components
// carving, Phase 2 step 11 — see CLAUDE.md). A true leaf module — every
// dependency (fb, dataArgs, lockScroll/unlockScroll, showToast) was already
// extracted, and nothing here calls back into legacy-app.js. `allProducts`
// and 4 of these 7 functions have several callers still in legacy-app.js
// (initFirebaseApp's auth listener; the bakery-profile-modal's own shop
// tab; SHOP MANAGEMENT's renderManageShop/saveProduct/deleteProduct — all
// 3 not yet extracted) — legacy-app.js imports them back, the ordinary
// one-way direction, not circular, since none of them are called from
// inside this module.

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { fb } from '../state/appState.js';
import { lockScroll, unlockScroll, showToast } from '../utils/dom.js';
import { escJS } from '../utils/strings.js';

export let allProducts = []; // all shop products cached

export async function loadProducts() {
  if (!fb) return;
  const { db, collection, getDocs, query, where, orderBy } = fb;
  try {
    const snap = await getDocs(collection(db, 'products'));
    allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.log('Products load:', e.message); }
}

export async function renderShopPage() {
  await loadProducts();
  const grid = document.getElementById('shopPageGrid');
  if (!grid) return;

  const available = allProducts.filter(p => p.available !== false);

  // Populate bakery filter
  const bakerySelect = document.getElementById('shopFilterBakery');
  const typeSelect = document.getElementById('shopFilterType');
  if (bakerySelect && typeSelect) {
    const bakeries = [...new Set(available.map(p => p.bakeryName).filter(Boolean))].sort();
    const types = [...new Set(available.map(p => p.productType).filter(Boolean))].sort();
    const curBakery = bakerySelect.value;
    const curType = typeSelect.value;
    bakerySelect.innerHTML = '<option value="">All bakeries</option>' +
      bakeries.map(b => `<option value="${escJS(b)}"${curBakery===b?' selected':''}>${b}</option>`).join('');
    typeSelect.innerHTML = '<option value="">All types</option>' +
      types.map(t => `<option value="${escJS(t)}"${curType===t?' selected':''}>${t}</option>`).join('');
  }

  applyShopFilters();
}

export function applyShopFilters() {
  const grid = document.getElementById('shopPageGrid');
  const countEl = document.getElementById('shopResultCount');
  if (!grid) return;

  const bakeryFilter = document.getElementById('shopFilterBakery')?.value || '';
  const typeFilter = document.getElementById('shopFilterType')?.value || '';
  const sortPrice = document.getElementById('shopSortPrice')?.value || '';

  let items = allProducts.filter(p => p.available !== false);

  if (bakeryFilter) items = items.filter(p => p.bakeryName === bakeryFilter);
  if (typeFilter) items = items.filter(p => p.productType === typeFilter);

  if (sortPrice === 'asc') items.sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (sortPrice === 'desc') items.sort((a, b) => (b.price || 0) - (a.price || 0));

  if (countEl) countEl.textContent = items.length ? `${items.length} item${items.length !== 1 ? 's' : ''}` : '';

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🛍️</div>
      <div class="empty-state-title">${allProducts.length ? 'No items match your filters' : 'No shops open yet'}</div>
      <div class="empty-state-text">${allProducts.length ? 'Try removing some filters.' : 'Bakery owners can open their shop from their bakery page.'}</div>
    </div>`;
    return;
  }

  grid.innerHTML = items.map(p => productCardHTML(p, true)).join('');
}

export function productCardHTML(p, showBakery) {
  const thumb = p.photoURL
    ? `<img src="${p.photoURL}" alt="${p.name}">`
    : '🛍️';
  const priceStr = p.price ? `£${parseFloat(p.price).toFixed(2)}` : 'POA';
  const isUnavailable = p.available === false;
  return `
    <div class="product-card${isUnavailable ? ' product-unavailable' : ''}" data-onclick="openProductDetail" data-args='${dataArgs([p.id])}'>
      <div class="product-card-image" style="position:relative;">
        ${thumb}
        ${isUnavailable ? '<div class="product-badge">Unavailable</div>' : ''}
      </div>
      <div class="product-card-body">
        ${showBakery ? `<div class="product-card-bakery" data-onclick="openBakeryProfile" data-args='${dataArgs([p.bakeryName || '', ''])}'>📍 ${p.bakeryName}</div>` : ''}
        <div class="product-card-name">${p.name}</div>
        ${p.productType ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">${p.productType}</div>` : ''}
        <div class="product-card-desc">${p.description || ''}</div>
        <div class="product-card-footer">
          <div class="product-card-price">${priceStr}</div>
          ${!isUnavailable ? `<button class="product-buy-btn" data-onclick="handleBuy" data-args='${dataArgs([p.id])}'>Buy →</button>` : ''}
        </div>
      </div>
    </div>`;
}

export function openProductDetail(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  document.getElementById('productDetailTitle').textContent = p.name;
  const priceStr = p.price ? `£${parseFloat(p.price).toFixed(2)}` : 'Price on application';
  const thumb = p.photoURL ? `<img src="${p.photoURL}" style="width:100%;max-height:280px;object-fit:cover;" alt="${p.name}">` : `<div style="height:160px;background:var(--parchment-dark);display:flex;align-items:center;justify-content:center;font-size:4rem;">🛍️</div>`;
  document.getElementById('productDetailContent').innerHTML = `
    ${thumb}
    <div style="padding:20px 24px 28px;">
      <div style="font-size:0.72rem;color:var(--caramel);font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">📍 ${p.bakeryName}</div>
      <div style="font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:var(--espresso);margin-bottom:8px;">${p.name}</div>
      <div style="font-size:0.9rem;color:var(--text-body);line-height:1.65;margin-bottom:16px;">${p.description || ''}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:16px;border-top:1px solid var(--border);">
        <div style="font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:var(--espresso);">${priceStr}</div>
        <button class="product-buy-btn" style="padding:11px 24px;font-size:0.9rem;" data-onclick="handleBuy" data-args='${dataArgs([p.id])}'>Buy now →</button>
      </div>
    </div>`;
  document.getElementById('productDetailModal').classList.add('open');
  lockScroll();
}

export function closeProductDetailModal() {
  document.getElementById('productDetailModal').classList.remove('open');
  unlockScroll();
}

export function handleBuy(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  if (p.buyLink) {
    window.open(p.buyLink, '_blank', 'noopener');
  } else if (p.enquiryEmail) {
    const subject = encodeURIComponent(`Enquiry: ${p.name} from ${p.bakeryName}`);
    const body = encodeURIComponent(`Hi,

I'm interested in purchasing "${p.name}" (£${p.price}) from your Crumbz shop.

Please let me know how to proceed.

Thanks`);
    window.location.href = `mailto:${p.enquiryEmail}?subject=${subject}&body=${body}`;
  } else {
    showToast('Contact the bakery directly to purchase');
  }
}

registerActions({ openProductDetail, handleBuy, applyShopFilters, closeProductDetailModal });
