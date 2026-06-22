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
  initWishlist();
  initWaBubble();
  try {
    loadProducts();
  } catch (err) {
    console.error('loadProducts failed:', err);
  }
});

})();
