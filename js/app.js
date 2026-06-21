// ============================================================
// Mimohflorist & Gift Shop — site logic (redesigned)
// ============================================================

const cfg = window.MIMOH_CONFIG;
let supabase = null;
let SUPABASE_READY = false;

try {
  if (!cfg) throw new Error('MIMOH_CONFIG missing — check js/config.js loaded before js/app.js');
  if (!window.supabase) throw new Error('Supabase library failed to load from CDN');
  supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  SUPABASE_READY = true;
} catch (err) {
  console.error('Supabase init failed:', err);
}

let ALL_PRODUCTS = [];
let ACTIVE_CATEGORY = 'All';
let CART = JSON.parse(localStorage.getItem('mimoh_cart') || '[]');

const fmt = (n) => `${cfg.CURRENCY} ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

const ICON = {
  flower: `<svg class="icon" style="width:40px;height:40px"><use href="#icon-flower"/></svg>`,
  plus:   `<svg class="icon" style="width:16px;height:16px"><use href="#icon-plus"/></svg>`,
  minus:  `<svg class="icon" style="width:14px;height:14px"><use href="#icon-minus"/></svg>`,
  trash:  `<svg class="icon" style="width:15px;height:15px"><use href="#icon-trash"/></svg>`,
  bag:    `<svg class="icon" style="width:64px;height:64px"><use href="#icon-bag"/></svg>`,
};

// ---------- Load products ----------
async function loadProducts() {
  const grid = document.getElementById('productGrid');

  if (!SUPABASE_READY) {
    grid.innerHTML = `<div class="empty-state">Couldn't connect to load products. Please refresh the page, or reach us on WhatsApp.</div>`;
    return;
  }

  grid.innerHTML = `<div class="empty-state">Loading arrangements...</div>`;

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    grid.innerHTML = `<div class="empty-state">Couldn't load products right now. Please refresh, or reach us on WhatsApp.</div>`;
    console.error(error);
    return;
  }

  ALL_PRODUCTS = data || [];
  buildCategoryFilters();
  renderProducts();
}

function buildCategoryFilters() {
  const cats = ['All', ...new Set(ALL_PRODUCTS.map(p => p.category).filter(Boolean))];
  const wrap = document.getElementById('filters');
  wrap.innerHTML = cats.map(c =>
    `<button class="filter-chip ${c === ACTIVE_CATEGORY ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
  wrap.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      ACTIVE_CATEGORY = btn.dataset.cat;
      buildCategoryFilters();
      renderProducts();
    });
  });
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  const list = ACTIVE_CATEGORY === 'All'
    ? ALL_PRODUCTS
    : ALL_PRODUCTS.filter(p => p.category === ACTIVE_CATEGORY);

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state">No products in this category yet — check back soon.</div>`;
    return;
  }

  grid.innerHTML = list.map(p => `
    <div class="product-card">
      <div class="product-img" ${p.image_url ? `style="background-image:url('${p.image_url}')"` : ''}>
        ${p.featured ? '<span class="badge">Featured</span>' : ''}
        ${!p.in_stock ? '<div class="oos">Out of Stock</div>' : ''}
        ${!p.image_url ? ICON.flower : ''}
      </div>
      <div class="product-body">
        <div class="product-cat">${p.category || ''}</div>
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-desc">${escapeHtml(p.description || '')}</div>
        <div class="product-foot">
          <div class="price">${fmt(p.price)}</div>
          <button class="add-btn" ${!p.in_stock ? 'disabled' : ''} data-id="${p.id}" title="Add to cart" aria-label="Add ${escapeHtml(p.name)} to cart">
            ${ICON.plus}
          </button>
        </div>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => addToCart(btn.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ---------- Cart ----------
function saveCart() {
  localStorage.setItem('mimoh_cart', JSON.stringify(CART));
  updateCartUI();
}

function addToCart(productId) {
  const product = ALL_PRODUCTS.find(p => p.id === productId);
  if (!product) return;
  const existing = CART.find(i => i.id === productId);
  if (existing) {
    existing.qty += 1;
  } else {
    CART.push({ id: product.id, name: product.name, price: product.price, image_url: product.image_url, qty: 1 });
  }
  saveCart();
  showToast(`${product.name} added to cart`);
}

function changeQty(productId, delta) {
  const item = CART.find(i => i.id === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) CART = CART.filter(i => i.id !== productId);
  saveCart();
}

function removeFromCart(productId) {
  CART = CART.filter(i => i.id !== productId);
  saveCart();
}

function cartTotal() {
  return CART.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function cartCount() {
  return CART.reduce((sum, i) => sum + i.qty, 0);
}

function updateCartUI() {
  const count = cartCount();
  document.getElementById('cartCount').textContent = count;

  const sub = document.getElementById('cartHeadSub');
  if (sub) sub.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;

  const itemsWrap = document.getElementById('cartItems');
  const footWrap = document.getElementById('cartFoot');

  if (!CART.length) {
    itemsWrap.innerHTML = `
      <div class="cart-empty">
        <svg class="icon" style="width:48px;height:48px;color:var(--rose-soft)"><use href="#icon-bag"/></svg>
        <p style="margin-top:12px">Your cart is empty.<br>Add something beautiful.</p>
      </div>`;
    footWrap.style.display = 'none';
    return;
  }

  footWrap.style.display = 'block';
  itemsWrap.innerHTML = CART.map(i => `
    <div class="cart-item">
      <div class="cart-item-thumb" ${i.image_url ? `style="background-image:url('${i.image_url}')"` : ''}>
        ${!i.image_url ? `<div style="display:flex;align-items:center;justify-content:center;height:100%"><svg class="icon" style="width:24px;height:24px;color:var(--rose);opacity:0.4"><use href="#icon-flower"/></svg></div>` : ''}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(i.name)}</div>
        <div class="cart-item-unit">${fmt(i.price)} each</div>
        <div class="qty-row">
          <button class="qty-btn" data-act="dec" data-id="${i.id}" aria-label="Decrease quantity">
            <svg class="icon" style="width:14px;height:14px"><use href="#icon-minus"/></svg>
          </button>
          <span class="qty-val">${i.qty}</span>
          <button class="qty-btn" data-act="inc" data-id="${i.id}" aria-label="Increase quantity">
            <svg class="icon" style="width:14px;height:14px"><use href="#icon-plus"/></svg>
          </button>
          <button class="remove-btn" data-id="${i.id}" aria-label="Remove item">
            <svg class="icon" style="width:15px;height:15px"><use href="#icon-trash"/></svg>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  document.getElementById('cartTotalVal').textContent = fmt(cartTotal());

  itemsWrap.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => changeQty(btn.dataset.id, btn.dataset.act === 'inc' ? 1 : -1));
  });
  itemsWrap.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.id));
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  if (toastMsg) toastMsg.textContent = msg;
  toast.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

// ---------- Checkout via WhatsApp ----------
function checkoutWhatsApp() {
  if (!CART.length) return;
  const lines = CART.map(i => `• ${i.name} x${i.qty} — ${fmt(i.price * i.qty)}`);
  const msg = [
    `Hello ${cfg.BUSINESS_NAME}! I'd like to place an order:`,
    '',
    ...lines,
    '',
    `Total: ${fmt(cartTotal())}`,
    '',
    'Please confirm availability and delivery details. Thank you!'
  ].join('\n');
  const url = `https://wa.me/${cfg.WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// ---------- UI wiring ----------
function initUI() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('overlay');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  function syncBodyScroll() {
    const cartOpen = drawer.classList.contains('open');
    const menuOpen = navLinks && navLinks.classList.contains('open');
    document.body.style.overflow = (cartOpen || menuOpen) ? 'hidden' : '';
  }

  function openDrawer() {
    if (navLinks && navLinks.classList.contains('open')) {
      navLinks.classList.remove('open');
      const navToggleIcon = navToggle && navToggle.querySelector('use');
      if (navToggleIcon) navToggleIcon.setAttribute('href', '#icon-menu');
    }
    drawer.classList.add('open'); overlay.classList.add('open'); syncBodyScroll();
  }
  function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('open'); syncBodyScroll(); }

  document.getElementById('cartBtn').addEventListener('click', openDrawer);
  document.getElementById('cartClose').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.getElementById('checkoutBtn').addEventListener('click', checkoutWhatsApp);

  // Mobile nav
  if (navToggle && navLinks) {
    const navToggleIcon = navToggle.querySelector('use');
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      syncBodyScroll();
      if (navToggleIcon) navToggleIcon.setAttribute('href', isOpen ? '#icon-close' : '#icon-menu');
    });
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      syncBodyScroll();
      if (navToggleIcon) navToggleIcon.setAttribute('href', '#icon-menu');
    }));
  }

  updateCartUI();
}

document.addEventListener('DOMContentLoaded', () => {
  initUI(); // menu + cart drawer wiring — must always run, independent of data load
  try {
    loadProducts();
  } catch (err) {
    console.error('loadProducts failed:', err);
  }
});
