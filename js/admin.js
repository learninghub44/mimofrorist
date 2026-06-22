// ============================================================
// Mimohflorist & Gift Shop — Admin panel logic
// ============================================================
(function () {

const cfg = window.MIMOH_CONFIG;

if (!cfg) {
  document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#9B2335;">Configuration failed to load (js/config.js). Check that the file exists and loaded before admin.js.</div>';
  throw new Error('MIMOH_CONFIG missing');
}

if (!window.supabase) {
  document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#9B2335;">The Supabase library failed to load from the CDN (unpkg.com). This is usually caused by an ad-blocker, browser extension, or network/firewall blocking unpkg.com. Try disabling ad-blockers for this site, or try a different network/browser, then refresh.</div>';
  throw new Error('Supabase library not loaded');
}

const supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

const fmt = (n) => `${cfg.CURRENCY} ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

let PRODUCTS = [];
let selectedImageFile = null;
let SEARCH_TERM = '';

// ---------- Auth ----------
async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    showAdmin(session.user);
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminScreen').style.display = 'none';
}

function showAdmin(user) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminScreen').style.display = 'block';
  document.getElementById('adminEmail').textContent = user.email;
  loadProducts();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('Login error:', error);
    errEl.textContent = error.message || 'Login failed. Please try again.';
    return;
  }
  showAdmin(data.user);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  showLogin();
});

// ---------- Load + render products ----------
async function loadProducts() {
  const tbody = document.getElementById('productTableBody');
  tbody.innerHTML = `<tr><td colspan="7" class="muted-cell">Loading products…</td></tr>`;

  const { data, error } = await supabaseClient
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted-cell">Couldn't load products. ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  PRODUCTS = data || [];
  renderTable();
  populateCategoryList();
}

function renderTable() {
  const tbody = document.getElementById('productTableBody');
  const countEl = document.getElementById('productSearchCount');

  if (!PRODUCTS.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted-cell">No products yet. Click "Add product" to create your first one.</td></tr>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  const term = SEARCH_TERM.trim().toLowerCase();
  const filtered = term
    ? PRODUCTS.filter(p => (p.name || '').toLowerCase().includes(term))
    : PRODUCTS;

  if (countEl) {
    countEl.textContent = term
      ? `${filtered.length} of ${PRODUCTS.length} products`
      : `${PRODUCTS.length} products`;
  }

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted-cell">No products match "${escapeHtml(SEARCH_TERM.trim())}".</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const onSale = p.sale_price != null && Number(p.sale_price) > 0 && Number(p.sale_price) < Number(p.price);
    const priceCell = onSale
      ? `<span style="text-decoration:line-through;color:#b09096;font-size:0.82rem;">${fmt(p.price)}</span><br><strong style="color:var(--rose);">${fmt(p.sale_price)}</strong>`
      : fmt(p.price);
    const tags = [
      p.featured ? '<span class="tag tag-featured">Featured</span>' : '',
      p.is_best_seller ? '<span class="tag tag-stock">Best Seller</span>' : '',
      p.is_new_arrival ? '<span class="tag tag-stock">New</span>' : '',
    ].filter(Boolean).join(' ');

    return `
    <tr>
      <td><img class="admin-thumb" src="${p.image_url || ''}" onerror="this.style.visibility='hidden'"></td>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(p.category || '')}</td>
      <td>${priceCell}</td>
      <td>${p.in_stock ? '<span class="tag tag-stock">In stock</span>' : '<span class="tag tag-oos">Out of stock</span>'}</td>
      <td>${tags}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-act="edit" data-id="${p.id}" title="Edit">✏️</button>
          <button class="icon-btn" data-act="delete" data-id="${p.id}" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>
  `;
  }).join('');

  tbody.querySelectorAll('[data-act="edit"]').forEach(btn =>
    btn.addEventListener('click', () => openModal(btn.dataset.id)));
  tbody.querySelectorAll('[data-act="delete"]').forEach(btn =>
    btn.addEventListener('click', () => deleteProduct(btn.dataset.id)));
}

// ---------- Search ----------
const productSearchInput = document.getElementById('productSearch');
if (productSearchInput) {
  let searchDebounce;
  productSearchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => {
      SEARCH_TERM = value;
      renderTable();
    }, 150);
  });
}

function populateCategoryList() {
  const cats = [...new Set(PRODUCTS.map(p => p.category).filter(Boolean))];
  document.getElementById('categoryList').innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ---------- Modal ----------
const modal = document.getElementById('productModal');
const modalOverlay = document.getElementById('modalOverlay');
const form = document.getElementById('productForm');

function openModal(productId = null) {
  form.reset();
  selectedImageFile = null;
  document.getElementById('formError').textContent = '';
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('productId').value = '';

  if (productId) {
    const p = PRODUCTS.find(x => x.id === productId);
    document.getElementById('modalTitle').textContent = 'Edit product';
    document.getElementById('productId').value = p.id;
    document.getElementById('productName').value = p.name;
    document.getElementById('productDescription').value = p.description || '';
    document.getElementById('productPrice').value = p.price;
    document.getElementById('productSalePrice').value = p.sale_price != null ? p.sale_price : '';
    document.getElementById('productCategory').value = p.category || '';
    document.getElementById('productBadge').value = p.badge || '';
    document.getElementById('productInStock').checked = p.in_stock;
    document.getElementById('productFeatured').checked = p.featured;
    document.getElementById('productBestSeller').checked = !!p.is_best_seller;
    document.getElementById('productNewArrival').checked = !!p.is_new_arrival;
    if (p.image_url) {
      const preview = document.getElementById('imagePreview');
      preview.src = p.image_url;
      preview.style.display = 'block';
    }
  } else {
    document.getElementById('modalTitle').textContent = 'Add product';
  }

  modal.classList.add('open');
  modalOverlay.classList.add('open');
}

function closeModal() {
  modal.classList.remove('open');
  modalOverlay.classList.remove('open');
}

document.getElementById('newProductBtn').addEventListener('click', () => openModal());
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);

document.getElementById('productImageFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedImageFile = file;
  const preview = document.getElementById('imagePreview');
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
});

// ---------- Save (create / update) ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById('saveBtn');
  const errEl = document.getElementById('formError');
  errEl.textContent = '';
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const id = document.getElementById('productId').value || null;
    let imageUrl = null;
    if (id) {
      const existing = PRODUCTS.find(p => p.id === id);
      imageUrl = existing ? existing.image_url : null;
    }

    if (selectedImageFile) {
      imageUrl = await uploadImage(selectedImageFile);
    }

    const salePriceRaw = document.getElementById('productSalePrice').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    let salePrice = salePriceRaw ? parseFloat(salePriceRaw) : null;
    if (salePrice != null && salePrice >= price) {
      throw new Error('Sale price must be lower than the regular price.');
    }

    const payload = {
      name: document.getElementById('productName').value.trim(),
      description: document.getElementById('productDescription').value.trim(),
      price,
      sale_price: salePrice,
      category: document.getElementById('productCategory').value.trim(),
      badge: document.getElementById('productBadge').value.trim() || null,
      in_stock: document.getElementById('productInStock').checked,
      featured: document.getElementById('productFeatured').checked,
      is_best_seller: document.getElementById('productBestSeller').checked,
      is_new_arrival: document.getElementById('productNewArrival').checked,
      image_url: imageUrl,
    };

    let error;
    if (id) {
      ({ error } = await supabaseClient.from('products').update(payload).eq('id', id));
    } else {
      ({ error } = await supabaseClient.from('products').insert(payload));
    }

    if (error) throw error;

    closeModal();
    showToast(id ? 'Product updated' : 'Product added');
    loadProducts();
  } catch (err) {
    errEl.textContent = err.message || 'Something went wrong. Please try again.';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save product';
  }
});

async function uploadImage(file) {
  const ext = file.name.split('.').pop();
  const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabaseClient.storage.from('product-images').upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabaseClient.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

// ---------- Delete ----------
async function deleteProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!confirm(`Delete "${p?.name || 'this product'}"? This can't be undone.`)) return;

  const { error } = await supabaseClient.from('products').delete().eq('id', id);
  if (error) {
    showToast('Could not delete product');
    return;
  }
  showToast('Product deleted');
  loadProducts();
}

// ---------- Toast ----------
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

checkSession();

})();
