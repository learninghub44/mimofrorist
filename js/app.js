// ============================================================
// Mimohflorist & Gift Shop — site logic (redesigned)
// ============================================================
(function () {

const cfg = window.MIMOH_CONFIG;
let supabaseClient = null;
let SUPABASE_READY = false;

try {
  if (!cfg) throw new Error('MIMOH_CONFIG missing — check js/config.js loaded before js/app.js');
  if (!window.supabase) throw new Error('Supabase library failed to load from CDN');
  supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  SUPABASE_READY = true;
} catch (err) {
  console.error('Supabase init failed:', err);
}

let ALL_PRODUCTS = [];
let ACTIVE_CATEGORY = 'All';
let CART = JSON.parse(localStorage.getItem('mimoh_cart') || '[]');
let WISHLIST = JSON.parse(localStorage.getItem('mimoh_wishlist') || '[]');

// ---- Voucher codes (admin can add more here) ----
const VOUCHER_CODES = {
  'MIMO10':   { type: 'percent', value: 10, label: '10% off' },
  'MIMO20':   { type: 'percent', value: 20, label: '20% off' },
  'FLOWERS':  { type: 'percent', value: 15, label: '15% off' },
  'BIRTHDAY': { type: 'flat',    value: 200, label: 'KES 200 off' },
  'WEDDING':  { type: 'flat',    value: 500, label: 'KES 500 off' },
  'NAIROBI':  { type: 'percent', value: 5,  label: '5% off' },
};
let APPLIED_VOUCHER = null; // { code, type, value, label }
const PRODUCTS_PER_BATCH = 24;
let visibleCount = PRODUCTS_PER_BATCH;
let scrollObserver = null;

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

  const { data, error } = await supabaseClient
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
  renderCuratedSections();
}

function renderCuratedSections() {
  let bestSellers = ALL_PRODUCTS.filter(p => p.is_best_seller);
  let newArrivals = ALL_PRODUCTS.filter(p => p.is_new_arrival);

  // Graceful fallback while you're still curating: show featured/newest items
  // so the sections aren't empty before badges are set in admin.
  if (!bestSellers.length) bestSellers = ALL_PRODUCTS.filter(p => p.featured).slice(0, 10);
  if (!newArrivals.length) newArrivals = [...ALL_PRODUCTS].slice(0, 10);

  renderCarousel('bestSellersTrack', bestSellers.slice(0, 12));
  renderCarousel('newArrivalsTrack', newArrivals.slice(0, 12));
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
      visibleCount = PRODUCTS_PER_BATCH;
      buildCategoryFilters();
      renderProducts();
    });
  });

  const dropdown = document.getElementById('navShopDropdown');
  if (dropdown) {
    const realCats = cats.filter(c => c !== 'All');
    dropdown.innerHTML = realCats.map(c =>
      `<a href="#shop" data-cat="${c}">${escapeHtml(c)}</a>`
    ).join('') || `<a href="#shop">Browse all</a>`;
    dropdown.querySelectorAll('a[data-cat]').forEach(link => {
      link.addEventListener('click', () => {
        ACTIVE_CATEGORY = link.dataset.cat;
        visibleCount = PRODUCTS_PER_BATCH;
        buildCategoryFilters();
        renderProducts();
        document.dispatchEvent(new CustomEvent('mimoh:closeMenus'));
      });
    });
  }
}

function productCardHtml(p) {
  const onSale = p.sale_price != null && Number(p.sale_price) > 0 && Number(p.sale_price) < Number(p.price);
  const badgeText = p.badge || (onSale ? 'Sale' : (p.is_new_arrival ? 'New' : (p.is_best_seller ? 'Best Seller' : (p.featured ? 'Featured' : ''))));
  const priceHtml = onSale
    ? `<div class="price-row"><span class="price price-strike">${fmt(p.price)}</span><span class="price price-sale">${fmt(p.sale_price)}</span></div>`
    : `<div class="price">${fmt(p.price)}</div>`;
  const wished = WISHLIST.some(w => w.id === p.id);

  return `
    <div class="product-card">
      <div class="product-img" ${p.image_url ? `style="background-image:url('${p.image_url}')"` : ''}>
        ${badgeText ? `<span class="badge${onSale ? ' badge-sale' : ''}">${escapeHtml(badgeText)}</span>` : ''}
        ${!p.in_stock ? '<div class="oos">Out of Stock</div>' : ''}
        ${!p.image_url ? ICON.flower : ''}
        <button class="card-wish-btn${wished ? ' is-wished' : ''}" data-id="${p.id}" aria-label="${wished ? 'Remove from wishlist' : 'Add to wishlist'}" title="Wishlist">
          <svg class="icon" style="width:16px;height:16px"><use href="#icon-heart"/></svg>
        </button>
      </div>
      <div class="product-body">
        <div class="product-cat">${p.category || ''}</div>
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-desc">${escapeHtml(p.description || '')}</div>
        <div class="product-foot">
          ${priceHtml}
          <button class="add-btn" ${!p.in_stock ? 'disabled' : ''} data-id="${p.id}" title="Add to cart" aria-label="Add ${escapeHtml(p.name)} to cart">
            ${ICON.plus}
          </button>
        </div>
      </div>
    </div>
  `;
}

function wireAddButtons(container) {
  container.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => addToCart(btn.dataset.id));
  });
  container.querySelectorAll('.card-wish-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWishlist(btn.dataset.id);
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
    if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }
    return;
  }

  const visibleList = list.slice(0, visibleCount);
  const hasMore = visibleCount < list.length;

  grid.innerHTML = visibleList.map(productCardHtml).join('')
    + (hasMore ? `<div class="scroll-sentinel" id="scrollSentinel"><span class="scroll-sentinel-spinner"></span></div>` : '');

  wireAddButtons(grid);
  setupScrollObserver(hasMore);
}

function renderCarousel(containerId, products) {
  const track = document.getElementById(containerId);
  if (!track) return;
  const section = track.closest('.carousel-section');
  if (!products.length) {
    if (section) section.style.display = 'none';
    return;
  }
  if (section) section.style.display = '';
  track.innerHTML = products.map(productCardHtml).join('');
  wireAddButtons(track);
}

function setupScrollObserver(hasMore) {
  if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }
  if (!hasMore) return;

  const sentinel = document.getElementById('scrollSentinel');
  if (!sentinel || !('IntersectionObserver' in window)) return;

  scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      visibleCount += PRODUCTS_PER_BATCH;
      renderProducts();
    }
  }, { rootMargin: '400px' });

  scrollObserver.observe(sentinel);
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

function cartSubtotal() {
  return CART.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function cartDiscount() {
  if (!APPLIED_VOUCHER) return 0;
  const sub = cartSubtotal();
  return APPLIED_VOUCHER.type === 'percent'
    ? Math.round(sub * APPLIED_VOUCHER.value / 100)
    : Math.min(APPLIED_VOUCHER.value, sub);
}

function cartTotal() {
  return cartSubtotal() - cartDiscount();
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

  document.getElementById('cartSubtotalVal').textContent = fmt(cartSubtotal());

  const discountRow = document.getElementById('cartDiscountRow');
  const discountVal  = document.getElementById('cartDiscountVal');
  const discountCode = document.getElementById('cartDiscountCode');
  const disc = cartDiscount();
  if (disc > 0 && APPLIED_VOUCHER) {
    discountRow.style.display = 'flex';
    discountVal.textContent   = `- ${fmt(disc)}`;
    discountCode.textContent  = APPLIED_VOUCHER.code;
  } else {
    discountRow.style.display = 'none';
  }

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
  const disc = cartDiscount();
  const discLine = disc > 0 && APPLIED_VOUCHER
    ? [`Voucher (${APPLIED_VOUCHER.code}): - ${fmt(disc)}`]
    : [];
  const msg = [
    `Hello ${cfg.BUSINESS_NAME}! I'd like to place an order:`,
    '',
    ...lines,
    '',
    `Subtotal: ${fmt(cartSubtotal())}`,
    ...discLine,
    `Total: ${fmt(cartTotal())}`,
    '',
    'Please confirm availability and delivery details. Thank you!'
  ].join('\n');
  const url = `https://wa.me/${cfg.WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');

  // Save order record if user is logged in
  if (SUPABASE_READY && ACCT && ACCT.user) {
    const summary = CART.map(i => `${i.qty}× ${i.name}`).join(', ');
    supabaseClient.from('orders').insert({
      user_id: ACCT.user.id,
      total_amount: cartTotal(),
      items_summary: summary,
      voucher_code: APPLIED_VOUCHER ? APPLIED_VOUCHER.code : null,
      discount_amt: cartDiscount()
    }).then(({ error }) => {
      if (error) console.warn('Order save failed:', error.message);
    });
  }
}

// ---------- UI wiring ----------
function initUI() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('overlay');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  const navOverlay = document.getElementById('navOverlay');
  const navToggleIcon = navToggle && navToggle.querySelector('use');
  const whatsappFloat = document.getElementById('whatsappFloat');

  function syncBodyScroll() {
    const cartOpen = drawer.classList.contains('open');
    const menuOpen = navLinks && navLinks.classList.contains('open');
    document.body.style.overflow = (cartOpen || menuOpen) ? 'hidden' : '';
  }

  function syncWhatsappFloat() {
    if (!whatsappFloat) return;
    const cartOpen = drawer.classList.contains('open');
    const menuOpen = navLinks && navLinks.classList.contains('open');
    whatsappFloat.classList.toggle('is-hidden', cartOpen || menuOpen);
  }

  function openMenu() {
    if (!navLinks) return;
    navLinks.classList.add('open');
    if (navOverlay) navOverlay.classList.add('open');
    syncBodyScroll();
    syncWhatsappFloat();
    if (navToggleIcon) navToggleIcon.setAttribute('href', '#icon-close');
  }
  function closeMenu() {
    if (!navLinks) return;
    navLinks.classList.remove('open');
    if (navOverlay) navOverlay.classList.remove('open');
    syncBodyScroll();
    syncWhatsappFloat();
    if (navToggleIcon) navToggleIcon.setAttribute('href', '#icon-menu');
  }

  function openDrawer() {
    closeMenu();
    drawer.classList.add('open'); overlay.classList.add('open'); syncBodyScroll(); syncWhatsappFloat();
  }
  function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('open'); syncBodyScroll(); syncWhatsappFloat(); }

  document.getElementById('cartBtn').addEventListener('click', openDrawer);
  document.getElementById('cartClose').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.getElementById('checkoutBtn').addEventListener('click', checkoutWhatsApp);

  // Voucher code
  const voucherInput = document.getElementById('voucherInput');
  const voucherApply = document.getElementById('voucherApplyBtn');
  const voucherMsg   = document.getElementById('voucherMsg');
  if (voucherInput && voucherApply && voucherMsg) {
    function applyVoucher() {
      const code = voucherInput.value.trim().toUpperCase();
      voucherMsg.className = 'voucher-msg';
      if (!code) { voucherMsg.textContent = ''; return; }
      const voucher = VOUCHER_CODES[code];
      if (!voucher) {
        APPLIED_VOUCHER = null;
        voucherMsg.classList.add('error');
        voucherMsg.textContent = '✗ Invalid code. Please check and try again.';
        updateCartUI();
        return;
      }
      APPLIED_VOUCHER = { code, ...voucher };
      voucherMsg.classList.add('success');
      voucherMsg.textContent = `✓ "${code}" applied — ${voucher.label}!`;
      voucherApply.textContent = 'Remove';
      voucherApply.style.background = 'var(--rose)';
      updateCartUI();
    }
    function removeVoucher() {
      APPLIED_VOUCHER = null;
      voucherInput.value = '';
      voucherMsg.className = 'voucher-msg';
      voucherMsg.textContent = '';
      voucherApply.textContent = 'Apply';
      voucherApply.style.background = '';
      updateCartUI();
    }
    voucherApply.addEventListener('click', () => {
      if (APPLIED_VOUCHER) removeVoucher(); else applyVoucher();
    });
    voucherInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') applyVoucher();
    });
  }

  // Mobile nav
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.contains('open') ? closeMenu() : openMenu();
    });
    if (navOverlay) navOverlay.addEventListener('click', closeMenu);
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  }

  // Dynamically-added nav dropdown links (rendered after product load) dispatch
  // this event instead of relying on the one-time listener attachment above
  document.addEventListener('mimoh:closeMenus', closeMenu);

  // Shop dropdown: toggle on click (mobile-friendly), hover handled by CSS on desktop
  const navDropdownTrigger = document.querySelector('.nav-dropdown-trigger');
  const navDropdownItem = document.querySelector('.nav-item-dropdown');
  if (navDropdownTrigger && navDropdownItem) {
    navDropdownTrigger.addEventListener('click', (e) => {
      if (window.matchMedia('(hover: none)').matches || window.innerWidth <= 768) {
        e.preventDefault();
        navDropdownItem.classList.toggle('open');
      }
    });
  }

  // Escape key closes whichever overlay is open
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const searchOverlay = document.getElementById('searchOverlay');
    if (searchOverlay && searchOverlay.classList.contains('open')) {
      searchOverlay.classList.remove('open');
      document.body.style.overflow = '';
    } else if (drawer.classList.contains('open')) closeDrawer();
    else if (navLinks && navLinks.classList.contains('open')) closeMenu();
  });

  updateCartUI();
}

// ---------- Hero Slider ----------
function initHeroSlider() {
  const slider = document.getElementById('heroSlider');
  if (!slider) return;

  const slides = Array.from(slider.querySelectorAll('.hero-slide'));
  const dots = Array.from(document.querySelectorAll('.hero-dot'));
  const prevBtn = document.getElementById('heroPrev');
  const nextBtn = document.getElementById('heroNext');
  if (slides.length <= 1) return;

  let current = 0;
  let timer = null;
  const AUTO_MS = 6000;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function goTo(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('is-active', i === current));
    dots.forEach((d, i) => d.classList.toggle('is-active', i === current));
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function startAuto() {
    if (reduceMotion) return;
    stopAuto();
    timer = setInterval(next, AUTO_MS);
  }
  function stopAuto() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  dots.forEach((dot, i) => dot.addEventListener('click', () => { goTo(i); startAuto(); }));
  if (nextBtn) nextBtn.addEventListener('click', () => { next(); startAuto(); });
  if (prevBtn) prevBtn.addEventListener('click', () => { prev(); startAuto(); });

  const heroSection = document.getElementById('hero');
  if (heroSection) {
    heroSection.addEventListener('mouseenter', stopAuto);
    heroSection.addEventListener('mouseleave', startAuto);
  }

  // Basic swipe support for touch devices
  let touchStartX = null;
  slider.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  slider.addEventListener('touchend', (e) => {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); startAuto(); }
    touchStartX = null;
  }, { passive: true });

  startAuto();
}

// ---------- FAQ Accordion ----------
function initFaqAccordion() {
  const items = document.querySelectorAll('.faq-item');
  if (!items.length) return;

  items.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (!question) return;
    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      items.forEach(i => i.classList.remove('is-open'));
      if (!isOpen) item.classList.add('is-open');
    });
  });
}

// ---------- Search ----------
function initSearch() {
  const searchBtn = document.getElementById('searchBtn');
  const searchOverlay = document.getElementById('searchOverlay');
  const searchClose = document.getElementById('searchClose');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  if (!searchBtn || !searchOverlay || !searchInput || !searchResults) return;

  function openSearch() {
    searchOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => searchInput.focus(), 50);
    renderSearchResults('');
  }
  function closeSearch() {
    searchOverlay.classList.remove('open');
    document.body.style.overflow = '';
    searchInput.value = '';
  }

  function renderSearchResults(term) {
    const q = term.trim().toLowerCase();
    if (!q) {
      searchResults.innerHTML = `<div class="search-hint">Start typing to search our flowers and gifts...</div>`;
      return;
    }
    const matches = ALL_PRODUCTS.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 20);
    if (!matches.length) {
      searchResults.innerHTML = `<div class="search-empty-state">No products match "${escapeHtml(term.trim())}". Try a different search, or message us on WhatsApp.</div>`;
      return;
    }
    searchResults.innerHTML = matches.map(p => `
      <div class="search-result-item" data-id="${p.id}" data-cat="${escapeHtml(p.category || '')}">
        <div class="search-result-thumb" ${p.image_url ? `style="background-image:url('${p.image_url}')"` : ''}>
          ${!p.image_url ? ICON.flower : ''}
        </div>
        <div class="search-result-info">
          <div class="search-result-name">${escapeHtml(p.name)}</div>
          <div class="search-result-cat">${escapeHtml(p.category || '')}</div>
        </div>
        <div class="search-result-price">${fmt(p.price)}</div>
      </div>
    `).join('');

    searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        ACTIVE_CATEGORY = item.dataset.cat || 'All';
        visibleCount = PRODUCTS_PER_BATCH;
        buildCategoryFilters();
        renderProducts();
        closeSearch();
        document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  let debounce;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounce);
    const value = e.target.value;
    debounce = setTimeout(() => renderSearchResults(value), 150);
  });

  searchBtn.addEventListener('click', openSearch);
  if (searchClose) searchClose.addEventListener('click', closeSearch);
  searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) closeSearch();
  });
}

// ============================================================
// Wishlist
// ============================================================
function saveWishlist() {
  try { localStorage.setItem('mimoh_wishlist', JSON.stringify(WISHLIST)); } catch {}
}

function updateWishlistCount() {
  const countEl = document.getElementById('wishlistCount');
  const btn = document.getElementById('wishlistBtn');
  if (!countEl || !btn) return;
  if (WISHLIST.length > 0) {
    countEl.textContent = WISHLIST.length;
    countEl.style.display = 'flex';
    btn.classList.add('is-active');
  } else {
    countEl.style.display = 'none';
    btn.classList.remove('is-active');
  }
}

function toggleWishlist(productId) {
  const idx = WISHLIST.findIndex(w => w.id === productId);
  if (idx >= 0) {
    WISHLIST.splice(idx, 1);
    showToast('Removed from wishlist');
  } else {
    const product = ALL_PRODUCTS.find(p => p.id === productId);
    if (product) {
      WISHLIST.push(product);
      showToast('Added to wishlist ❤️');
    }
  }
  saveWishlist();
  updateWishlistCount();
  renderWishlistDrawer();
  // Update heart button state on visible cards
  document.querySelectorAll(`.card-wish-btn[data-id="${productId}"]`).forEach(btn => {
    const wished = WISHLIST.some(w => w.id === productId);
    btn.classList.toggle('is-wished', wished);
    btn.setAttribute('aria-label', wished ? 'Remove from wishlist' : 'Add to wishlist');
  });
}

function renderWishlistDrawer() {
  const container = document.getElementById('wishlistItems');
  if (!container) return;
  if (WISHLIST.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <svg class="icon" style="width:48px;height:48px;color:var(--rose-light)"><use href="#icon-heart"/></svg>
        <p>Your wishlist is empty</p>
        <a href="#shop" class="btn btn-primary btn-sm" style="margin-top:12px">Browse Products</a>
      </div>`;
    return;
  }
  container.innerHTML = WISHLIST.map(p => `
    <div class="wishlist-item">
      <img class="wishlist-item-img" src="${p.image_url || ''}" alt="${escapeHtml(p.name)}" onerror="this.style.display='none'">
      <div class="wishlist-item-info">
        <div class="wishlist-item-name">${escapeHtml(p.name)}</div>
        <div class="wishlist-item-price">${fmt(p.sale_price || p.price)}</div>
      </div>
      <div class="wishlist-item-actions">
        <button class="wishlist-item-btn" data-wish-cart="${p.id}" title="Add to cart" aria-label="Add to cart">
          <svg class="icon" style="width:14px;height:14px"><use href="#icon-bag"/></svg>
        </button>
        <button class="wishlist-item-btn remove-wish" data-wish-remove="${p.id}" title="Remove" aria-label="Remove from wishlist">
          <svg class="icon" style="width:14px;height:14px"><use href="#icon-trash"/></svg>
        </button>
      </div>
    </div>
  `).join('');
  container.querySelectorAll('[data-wish-cart]').forEach(btn => {
    btn.addEventListener('click', () => { addToCart(btn.dataset.wishCart); showToast('Added to cart!'); });
  });
  container.querySelectorAll('[data-wish-remove]').forEach(btn => {
    btn.addEventListener('click', () => toggleWishlist(btn.dataset.wishRemove));
  });
}

// ===== ACCOUNT MODULE =====
const ACCT = { user: null, session: null };

function openAcct() {
  document.getElementById('acctDrawer').classList.add('is-open');
  document.getElementById('acctOverlay').classList.add('is-open');
  document.body.style.overflow = 'hidden';
  if (ACCT.user) showProfilePane();
  else showAuthTabs('login');
}

function closeAcct() {
  document.getElementById('acctDrawer').classList.remove('is-open');
  document.getElementById('acctOverlay').classList.remove('is-open');
  document.body.style.overflow = '';
}

function showAuthTabs(tab) {
  document.getElementById('acctTabs').style.display = 'flex';
  setAcctPane(tab === 'login' ? 'Login' : 'Register',
    tab === 'login' ? 'acctPaneLogin' : 'acctPaneRegister');
  document.querySelectorAll('.acct-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
}

function showProfilePane() {
  document.getElementById('acctTabs').style.display = 'none';
  setAcctPane('My Account', 'acctPaneProfile');
  const name = ACCT.user.user_metadata?.display_name || ACCT.user.email.split('@')[0];
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('acctAvatarLg').textContent = initials;
  document.getElementById('acctDisplayName').textContent = name;
  document.getElementById('acctEmailLabel').textContent = ACCT.user.email;
  // Update nav avatar
  const navAvatar = document.getElementById('acctAvatar');
  if (navAvatar) {
    navAvatar.textContent = initials;
    navAvatar.style.display = 'flex';
    document.querySelector('#acctBtn svg').style.display = 'none';
  }
}

function setAcctPane(title, paneId) {
  document.getElementById('acctTitle').textContent = title;
  document.querySelectorAll('.acct-pane').forEach(p => p.style.display = 'none');
  document.getElementById(paneId).style.display = 'block';
}

function setMsg(id, msg, isSuccess = false) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'acct-msg' + (isSuccess ? ' success' : '');
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw = document.getElementById('loginPassword').value;
  if (!email || !pw) return setMsg('loginMsg', 'Please fill in all fields.');
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pw });
    if (error) throw error;
    ACCT.user = data.user;
    ACCT.session = data.session;
    closeAcct();
    setTimeout(() => { openAcct(); showProfilePane(); }, 100);
  } catch (err) {
    setMsg('loginMsg', err.message || 'Login failed. Check your email and password.');
  } finally {
    btn.disabled = false; btn.textContent = 'Sign In';
  }
}

async function doRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const pw = document.getElementById('regPassword').value;
  if (!name || !email || !pw) return setMsg('regMsg', 'Name, email, and password are required.');
  if (pw.length < 6) return setMsg('regMsg', 'Password must be at least 6 characters.');
  const btn = document.getElementById('registerBtn');
  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email, password: pw,
      options: { data: { display_name: name, phone: phone || null } }
    });
    if (error) throw error;
    if (data.user && data.session) {
      ACCT.user = data.user; ACCT.session = data.session;
      // Upsert profile row
      await supabaseClient.from('customer_profiles').upsert({
        id: data.user.id, display_name: name, phone: phone || null
      });
      closeAcct();
      setTimeout(() => { openAcct(); showProfilePane(); }, 100);
    } else {
      setMsg('regMsg', 'Account created! Check your email to confirm then sign in.', true);
    }
  } catch (err) {
    setMsg('regMsg', err.message || 'Registration failed. Try a different email.');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}

async function doLogout() {
  await supabaseClient.auth.signOut();
  ACCT.user = null; ACCT.session = null;
  // Reset nav avatar
  const navAvatar = document.getElementById('acctAvatar');
  if (navAvatar) {
    navAvatar.style.display = 'none';
    document.querySelector('#acctBtn svg').style.display = '';
  }
  closeAcct();
}

async function doForgotPw() {
  const email = prompt('Enter your email address to reset your password:');
  if (!email) return;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  if (error) alert('Error: ' + error.message);
  else alert('Password reset email sent! Check your inbox.');
}

async function loadOrders() {
  const listEl = document.getElementById('acctOrdersList');
  listEl.innerHTML = '<p class="acct-empty">Loading…</p>';
  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('user_id', ACCT.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    if (!data || data.length === 0) {
      listEl.innerHTML = '<p class="acct-empty">No orders yet — start shopping! 🌸</p>';
      return;
    }
    listEl.innerHTML = data.map(o => {
      const date = new Date(o.created_at).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' });
      return `<div class="acct-order-card">
        <div class="acct-order-meta">
          <span class="acct-order-id">#${o.id.slice(0,8).toUpperCase()}</span>
          <span class="acct-order-date">${date}</span>
        </div>
        <div class="acct-order-total">KES ${Number(o.total_amount||0).toLocaleString()}</div>
        <div class="acct-order-items">${o.items_summary || 'Order via WhatsApp'}</div>
      </div>`;
    }).join('');
  } catch {
    listEl.innerHTML = '<p class="acct-empty">Could not load orders. Try again later.</p>';
  }
}

function initAccount() {
  if (!SUPABASE_READY) return;

  // Restore session on page load
  supabaseClient.auth.getSession().then(({ data }) => {
    if (data?.session) {
      ACCT.user = data.session.user;
      ACCT.session = data.session;
      // Update nav avatar silently
      const name = ACCT.user.user_metadata?.display_name || ACCT.user.email.split('@')[0];
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
      const navAvatar = document.getElementById('acctAvatar');
      if (navAvatar) {
        navAvatar.textContent = initials;
        navAvatar.style.display = 'flex';
        const icon = document.querySelector('#acctBtn svg');
        if (icon) icon.style.display = 'none';
      }
    }
  });

  // Listen for auth state changes
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      ACCT.user = session.user; ACCT.session = session;
    } else if (event === 'SIGNED_OUT') {
      ACCT.user = null; ACCT.session = null;
    }
  });

  // Wiring
  document.getElementById('acctBtn').addEventListener('click', openAcct);
  document.getElementById('acctClose').addEventListener('click', closeAcct);
  document.getElementById('acctOverlay').addEventListener('click', closeAcct);

  document.querySelectorAll('.acct-tab').forEach(tab => {
    tab.addEventListener('click', () => showAuthTabs(tab.dataset.tab));
  });

  document.getElementById('goRegister').addEventListener('click', e => { e.preventDefault(); showAuthTabs('register'); });
  document.getElementById('goLogin').addEventListener('click', e => { e.preventDefault(); showAuthTabs('login'); });
  document.getElementById('forgotPw').addEventListener('click', e => { e.preventDefault(); doForgotPw(); });

  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('registerBtn').addEventListener('click', doRegister);
  document.getElementById('logoutBtn').addEventListener('click', doLogout);

  document.getElementById('viewOrdersBtn').addEventListener('click', () => {
    setAcctPane('Order History', 'acctPaneOrders');
    document.getElementById('acctTabs').style.display = 'none';
    loadOrders();
  });

  document.getElementById('backToProfile').addEventListener('click', () => {
    showProfilePane();
  });

  // Submit on Enter key in login/register fields
  ['loginEmail','loginPassword'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  });
  ['regName','regEmail','regPhone','regPassword'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
  });
}


function initWishlist() {
  const drawer = document.getElementById('wishlistDrawer');
  const overlay = document.getElementById('wishlistOverlay');
  const openBtn = document.getElementById('wishlistBtn');
  const closeBtn = document.getElementById('wishlistClose');
  if (!drawer || !overlay || !openBtn || !closeBtn) return;

  let wishlistOpen = false;

  function openWishlist() {
    wishlistOpen = true;
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    renderWishlistDrawer();
  }
  function closeWishlist() {
    wishlistOpen = false;
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  openBtn.addEventListener('click', () => wishlistOpen ? closeWishlist() : openWishlist());
  closeBtn.addEventListener('click', closeWishlist);
  overlay.addEventListener('click', closeWishlist);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && wishlistOpen) closeWishlist(); });

  updateWishlistCount();
}

function initNewsletter() {
  const form  = document.getElementById('newsletterForm');
  const email = document.getElementById('newsletterEmail');
  const msg   = document.getElementById('newsletterMsg');
  if (!form || !email || !msg) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    msg.className = 'newsletter-msg';
    const val = email.value.trim();
    if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      msg.classList.add('error');
      msg.textContent = 'Please enter a valid email address.';
      return;
    }
    // Store locally (real implementation would POST to an email service)
    const subs = JSON.parse(localStorage.getItem('mimoh_subscribers') || '[]');
    if (subs.includes(val)) {
      msg.classList.add('success');
      msg.textContent = '✓ You\'re already subscribed — thank you!';
      return;
    }
    subs.push(val);
    try { localStorage.setItem('mimoh_subscribers', JSON.stringify(subs)); } catch {}
    msg.classList.add('success');
    msg.textContent = '✓ Subscribed! Welcome to the Mimo family 🌸';
    email.value = '';
    // Also send a WhatsApp note to the business (optional lead capture)
    // window.open(`https://wa.me/${cfg.WHATSAPP_NUMBER}?text=${encodeURIComponent(`New newsletter subscriber: ${val}`)}`, '_blank');
  });
}

function initWaBubble() {
  const bubble   = document.getElementById('waBubble');
  const closeBtn = document.getElementById('waBubbleClose');
  const floatBtn = document.getElementById('whatsappFloat');
  if (!bubble || !closeBtn || !floatBtn) return;

  // Don't show if user already dismissed this session
  const dismissed = sessionStorage.getItem('waBubbleDismissed');
  if (dismissed) return;

  // Show bubble after 4 seconds
  const showTimer = setTimeout(() => {
    bubble.classList.add('is-visible');
  }, 4000);

  function hideBubble() {
    bubble.classList.remove('is-visible');
    sessionStorage.setItem('waBubbleDismissed', '1');
  }

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideBubble();
  });

  // Clicking the float button toggles the bubble
  floatBtn.addEventListener('click', (e) => {
    if (bubble.classList.contains('is-visible')) {
      hideBubble();
    } else {
      bubble.classList.add('is-visible');
    }
  });

  // Close bubble when cart or menu opens
  document.addEventListener('mimoh:cartOpen', hideBubble);
  document.addEventListener('mimoh:menuOpen', hideBubble);

  // Respect reduced motion — skip auto-show
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    clearTimeout(showTimer);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initUI(); // menu + cart drawer wiring — must always run, independent of data load
  initHeroSlider();
  initFaqAccordion();
  initSearch();
  initAccount();
  initWishlist();
  initNewsletter();
  initWaBubble();
  try {
    loadProducts();
  } catch (err) {
    console.error('loadProducts failed:', err);
  }
});

})();
