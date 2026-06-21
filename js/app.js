// ============================================================
// Mimohflorist & Gift Shop — site logic
// ============================================================

const cfg = window.MIMOH_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

let ALL_PRODUCTS = [];
let ACTIVE_CATEGORY = 'All';
let CART = JSON.parse(localStorage.getItem('mimoh_cart') || '[]');

const fmt = (n) => `${cfg.CURRENCY} ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

// ---------- Load products ----------
async function loadProducts() {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = `<div class="empty-state">Loading fresh arrangements…</div>`;

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
      <div class="product-img" style="${p.image_url ? `background-image:url('${p.image_url}')` : ''}">
        ${p.featured ? '<span class="badge">Featured</span>' : ''}
        ${!p.in_stock ? '<div class="oos">Out of stock</div>' : ''}
        ${!p.image_url ? '🌸' : ''}
      </div>
      <div class="product-body">
        <div class="product-cat">${p.category || ''}</div>
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-desc">${escapeHtml(p.description || '')}</div>
        <div class="product-foot">
          <div class="price">${fmt(p.price)}</div>
          <button class="add-btn" ${!p.in_stock ? 'disabled' : ''} data-id="${p.id}" title="Add to cart">+</button>
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
  document.getElementById('cartCount').textContent = cartCount();
  const itemsWrap = document.getElementById('cartItems');
  const footWrap = document.getElementById('cartFoot');

  if (!CART.length) {
    itemsWrap.innerHTML = `<div class="cart-empty">Your cart is empty.<br>Add something beautiful 🌸</div>`;
    footWrap.style.display = 'none';
    return;
  }

  footWrap.style.display = 'block';
  itemsWrap.innerHTML = CART.map(i => `
    <div class="cart-item">
      <img src="${i.image_url || ''}" onerror="this.style.visibility='hidden'">
      <div class="cart-item-info">
        <div class="name">${escapeHtml(i.name)}</div>
        <div class="unit">${fmt(i.price)} each</div>
        <div class="qty-row">
          <button class="qty-btn" data-act="dec" data-id="${i.id}">−</button>
          <span class="qty-val">${i.qty}</span>
          <button class="qty-btn" data-act="inc" data-id="${i.id}">+</button>
          <button class="remove-btn" data-id="${i.id}">Remove</button>
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
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
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

// ---------- Drawer + nav wiring ----------
function initUI() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('overlay');

  document.getElementById('cartBtn').addEventListener('click', () => {
    drawer.classList.add('open'); overlay.classList.add('open');
  });
  document.getElementById('cartClose').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.getElementById('checkoutBtn').addEventListener('click', checkoutWhatsApp);

  function closeDrawer() {
    drawer.classList.remove('open'); overlay.classList.remove('open');
  }

  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));
  }

  updateCartUI();
}

document.addEventListener('DOMContentLoaded', () => {
  initUI();
  loadProducts();
});
