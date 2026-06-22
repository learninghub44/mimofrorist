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
  document.getElementById('productId').value = '';
  // Reset drop zone
  const previewWrap = document.getElementById('imagePreviewWrap');
  const preview = document.getElementById('imagePreview');
  const dropInner = document.getElementById('dropZoneInner');
  previewWrap.style.display = 'none';
  preview.src = '';
  if (dropInner) dropInner.style.display = '';

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
      preview.src = p.image_url;
      previewWrap.style.display = 'block';
      if (dropInner) dropInner.style.display = 'none';
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

// ===== Drag-drop image upload (product) =====
let selectedBlogImageFile = null;

function setupDropZone({ zoneId, fileInputId, previewId, previewWrapId, clearBtnId, progressId, progressBarId, progressLabelId, onFile }) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(fileInputId);
  if (!zone || !input) return;

  ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => {
    e.preventDefault(); zone.classList.add('drag-over');
  }));
  ['dragleave','drop'].forEach(ev => zone.addEventListener(ev, e => {
    e.preventDefault(); zone.classList.remove('drag-over');
  }));
  zone.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageFile(file);
  });
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleImageFile(file);
  });

  const clearBtn = document.getElementById(clearBtnId);
  if (clearBtn) clearBtn.addEventListener('click', e => {
    e.stopPropagation();
    input.value = '';
    document.getElementById(previewId).src = '';
    document.getElementById(previewWrapId).style.display = 'none';
    zone.querySelector('.drop-zone-inner').style.display = '';
    onFile(null);
  });

  function handleImageFile(file) {
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5 MB'); return; }
    const preview = document.getElementById(previewId);
    const wrap = document.getElementById(previewWrapId);
    preview.src = URL.createObjectURL(file);
    wrap.style.display = 'block';
    zone.querySelector('.drop-zone-inner').style.display = 'none';
    onFile(file);
  }
}

setupDropZone({
  zoneId: 'imageDropZone', fileInputId: 'productImageFile',
  previewId: 'imagePreview', previewWrapId: 'imagePreviewWrap',
  clearBtnId: 'clearImageBtn',
  progressId: 'uploadProgress', progressBarId: 'uploadProgressBar', progressLabelId: 'uploadProgressLabel',
  onFile: (file) => { selectedImageFile = file; }
});

setupDropZone({
  zoneId: 'blogImageDropZone', fileInputId: 'blogImageFile',
  previewId: 'blogImagePreview', previewWrapId: 'blogImagePreviewWrap',
  clearBtnId: 'clearBlogImageBtn',
  progressId: 'blogUploadProgress', progressBarId: 'blogUploadProgressBar', progressLabelId: 'blogUploadProgressLabel',
  onFile: (file) => { selectedBlogImageFile = file; }
});

// Show progress during upload
async function uploadImageWithProgress(file, progressBarId, progressLabelId, progressId) {
  const prog = document.getElementById(progressId);
  const bar = document.getElementById(progressBarId);
  const label = document.getElementById(progressLabelId);
  prog.style.display = 'flex';
  bar.style.setProperty('--pct', '10%');
  label.textContent = 'Uploading…';
  try {
    const url = await uploadImage(file, (pct) => {
      bar.style.setProperty('--pct', pct + '%');
      label.textContent = `Uploading… ${pct}%`;
    });
    bar.style.setProperty('--pct', '100%');
    label.textContent = 'Done ✓';
    setTimeout(() => { prog.style.display = 'none'; }, 1200);
    return url;
  } catch (err) {
    prog.style.display = 'none';
    throw err;
  }
}

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
      imageUrl = await uploadImageWithProgress(selectedImageFile, 'uploadProgressBar', 'uploadProgressLabel', 'uploadProgress');
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

async function uploadImage(file, folder = 'products') {
  const ext = file.name.split('.').pop();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
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

// ============================================================
// Tab switching handled at bottom of file

// ============================================================
// PROMO CODES
// ============================================================
async function loadPromoCodes() {
  const tbody = document.getElementById('promoTableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="muted-cell">Loading…</td></tr>';
  const { data, error } = await supabaseClient
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted-cell">Could not load promo codes.</td></tr>';
    return;
  }
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted-cell">No promo codes yet.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(p => {
    const val = p.type === 'percent' ? `${p.value}%` : `KES ${p.value}`;
    const exp = p.expires_at ? new Date(p.expires_at).toLocaleDateString('en-KE') : '—';
    const pill = p.active
      ? '<span class="pill pill-green">Active</span>'
      : '<span class="pill pill-grey">Off</span>';
    return `<tr>
      <td><strong>${p.code}</strong></td>
      <td>${p.type === 'percent' ? 'Percent' : 'Flat'}</td>
      <td>${val}</td>
      <td>${p.label || '—'}</td>
      <td>${exp}</td>
      <td>${pill}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editPromo('${p.id}')">Edit</button>
        <button class="btn btn-sm btn-outline" style="color:#c66c6c;margin-left:4px" onclick="deletePromo('${p.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

let PROMO_EDITING = null;
function openPromoModal(promo = null) {
  PROMO_EDITING = promo;
  document.getElementById('promoId').value = promo ? promo.id : '';
  document.getElementById('promoCode').value = promo ? promo.code : '';
  document.getElementById('promoType').value = promo ? promo.type : 'percent';
  document.getElementById('promoValue').value = promo ? promo.value : '';
  document.getElementById('promoLabel').value = promo ? (promo.label || '') : '';
  document.getElementById('promoExpires').value = promo && promo.expires_at
    ? new Date(promo.expires_at).toISOString().slice(0,16) : '';
  document.getElementById('promoActive').checked = promo ? promo.active : true;
  document.getElementById('promoFormError').textContent = '';
  document.getElementById('promoModalTitle').textContent = promo ? 'Edit Promo Code' : 'New Promo Code';
  document.getElementById('promoModal').classList.add('is-open');
  document.getElementById('promoModalOverlay').classList.add('is-open');
}
function closePromoModal() {
  document.getElementById('promoModal').classList.remove('is-open');
  document.getElementById('promoModalOverlay').classList.remove('is-open');
}

window.editPromo = async (id) => {
  const { data } = await supabaseClient.from('promo_codes').select('*').eq('id', id).single();
  if (data) openPromoModal(data);
};
window.deletePromo = async (id) => {
  if (!confirm('Delete this promo code?')) return;
  await supabaseClient.from('promo_codes').delete().eq('id', id);
  showToast('Promo code deleted');
  loadPromoCodes();
};

document.getElementById('newPromoBtn').addEventListener('click', () => openPromoModal());
document.getElementById('promoModalClose').addEventListener('click', closePromoModal);
document.getElementById('promoCancelBtn').addEventListener('click', closePromoModal);
document.getElementById('promoModalOverlay').addEventListener('click', closePromoModal);

document.getElementById('promoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('promoFormError');
  errEl.textContent = '';
  const payload = {
    code: document.getElementById('promoCode').value.trim().toUpperCase(),
    type: document.getElementById('promoType').value,
    value: parseFloat(document.getElementById('promoValue').value),
    label: document.getElementById('promoLabel').value.trim() || null,
    expires_at: document.getElementById('promoExpires').value || null,
    active: document.getElementById('promoActive').checked,
  };
  if (!payload.code || !payload.value) { errEl.textContent = 'Code and value are required.'; return; }
  const btn = document.getElementById('promoSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  let error;
  if (PROMO_EDITING) {
    ({ error } = await supabaseClient.from('promo_codes').update(payload).eq('id', PROMO_EDITING.id));
  } else {
    ({ error } = await supabaseClient.from('promo_codes').insert(payload));
  }
  btn.disabled = false; btn.textContent = 'Save code';
  if (error) { errEl.textContent = error.message; return; }
  showToast(PROMO_EDITING ? 'Promo code updated' : 'Promo code created');
  closePromoModal();
  loadPromoCodes();
});

// ============================================================
// BLOG POSTS
// ============================================================
async function loadBlogPosts() {
  const tbody = document.getElementById('blogTableBody');
  tbody.innerHTML = '<tr><td colspan="5" class="muted-cell">Loading…</td></tr>';
  const { data, error } = await supabaseClient
    .from('blog_posts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted-cell">Could not load posts.</td></tr>';
    return;
  }
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted-cell">No posts yet.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(p => {
    const date = new Date(p.created_at).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' });
    const pill = p.published
      ? '<span class="pill pill-green">Live</span>'
      : '<span class="pill pill-grey">Draft</span>';
    return `<tr>
      <td>${p.title}</td>
      <td>${p.category || '—'}</td>
      <td>${pill}</td>
      <td>${date}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editBlogPost('${p.id}')">Edit</button>
        <button class="btn btn-sm btn-outline" style="color:#c66c6c;margin-left:4px" onclick="deleteBlogPost('${p.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

let BLOG_EDITING = null;
function openBlogModal(post = null) {
  BLOG_EDITING = post;
  selectedBlogImageFile = null;
  document.getElementById('blogId').value = post ? post.id : '';
  document.getElementById('blogTitle').value = post ? post.title : '';
  document.getElementById('blogExcerpt').value = post ? (post.excerpt || '') : '';
  document.getElementById('blogCategory').value = post ? (post.category || '') : '';
  document.getElementById('blogImageUrl').value = post ? (post.image_url || '') : '';
  document.getElementById('blogLinkLabel').value = post ? (post.link_label || 'Read more') : 'Read more';
  document.getElementById('blogLinkHref').value = post ? (post.link_href || '#shop') : '#shop';
  document.getElementById('blogPublished').checked = post ? post.published : true;
  document.getElementById('blogFormError').textContent = '';
  document.getElementById('blogModalTitle').textContent = post ? 'Edit Blog Post' : 'New Blog Post';
  // Reset blog drop zone
  const blogPreviewWrap = document.getElementById('blogImagePreviewWrap');
  const blogPreview = document.getElementById('blogImagePreview');
  const blogDropInner = document.getElementById('blogDropZoneInner');
  if (post && post.image_url) {
    blogPreview.src = post.image_url;
    blogPreviewWrap.style.display = 'block';
    if (blogDropInner) blogDropInner.style.display = 'none';
  } else {
    blogPreviewWrap.style.display = 'none';
    if (blogDropInner) blogDropInner.style.display = '';
    blogPreview.src = '';
  }
  document.getElementById('blogModal').classList.add('is-open');
  document.getElementById('blogModalOverlay').classList.add('is-open');
}
function closeBlogModal() {
  document.getElementById('blogModal').classList.remove('is-open');
  document.getElementById('blogModalOverlay').classList.remove('is-open');
}

window.editBlogPost = async (id) => {
  const { data } = await supabaseClient.from('blog_posts').select('*').eq('id', id).single();
  if (data) openBlogModal(data);
};
window.deleteBlogPost = async (id) => {
  if (!confirm('Delete this blog post?')) return;
  await supabaseClient.from('blog_posts').delete().eq('id', id);
  showToast('Post deleted');
  loadBlogPosts();
};

document.getElementById('newBlogBtn').addEventListener('click', () => openBlogModal());
document.getElementById('blogModalClose').addEventListener('click', closeBlogModal);
document.getElementById('blogCancelBtn').addEventListener('click', closeBlogModal);
document.getElementById('blogModalOverlay').addEventListener('click', closeBlogModal);

document.getElementById('blogForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('blogFormError');
  errEl.textContent = '';
  let blogImageUrl = document.getElementById('blogImageUrl').value.trim() || null;
  if (selectedBlogImageFile) {
    try {
      blogImageUrl = await uploadImageWithProgress(selectedBlogImageFile, 'blogUploadProgressBar', 'blogUploadProgressLabel', 'blogUploadProgress');
    } catch (err) {
      errEl.textContent = 'Image upload failed: ' + err.message; return;
    }
  }
  const payload = {
    title: document.getElementById('blogTitle').value.trim(),
    excerpt: document.getElementById('blogExcerpt').value.trim() || null,
    category: document.getElementById('blogCategory').value.trim() || null,
    image_url: blogImageUrl,
    link_label: document.getElementById('blogLinkLabel').value.trim() || 'Read more',
    link_href: document.getElementById('blogLinkHref').value.trim() || '#shop',
    published: document.getElementById('blogPublished').checked,
  };
  if (!payload.title) { errEl.textContent = 'Title is required.'; return; }
  const btn = document.getElementById('blogSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  let error;
  if (BLOG_EDITING) {
    ({ error } = await supabaseClient.from('blog_posts').update(payload).eq('id', BLOG_EDITING.id));
  } else {
    ({ error } = await supabaseClient.from('blog_posts').insert(payload));
  }
  btn.disabled = false; btn.textContent = 'Save post';
  if (error) { errEl.textContent = error.message; return; }
  showToast(BLOG_EDITING ? 'Post updated' : 'Post published');
  closeBlogModal();
  loadBlogPosts();
});

// ============================================================
// ORDERS
// ============================================================
async function loadOrders() {
  const tbody = document.getElementById('ordersTableBody');
  const countEl = document.getElementById('ordersCount');
  tbody.innerHTML = '<tr><td colspan="6" class="muted-cell">Loading…</td></tr>';

  // Join orders with customer_profiles to get names
  const { data, error } = await supabaseClient
    .from('orders')
    .select(`
      id,
      total_amount,
      items_summary,
      voucher_code,
      discount_amt,
      created_at,
      user_id,
      customer_profiles ( display_name )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted-cell">Error: ${error.message}</td></tr>`;
    return;
  }
  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted-cell">No orders yet.</td></tr>';
    if (countEl) countEl.textContent = '';
    return;
  }

  if (countEl) countEl.textContent = `${data.length} order${data.length !== 1 ? 's' : ''}`;

  tbody.innerHTML = data.map(o => {
    const shortId = o.id.slice(0,8).toUpperCase();
    const name = o.customer_profiles?.display_name || '—';
    const items = o.items_summary || '—';
    const voucher = o.voucher_code
      ? `<span class="pill pill-green">${o.voucher_code}</span>`
      : '—';
    const total = `<strong>${fmt(o.total_amount || 0)}</strong>`;
    const date = new Date(o.created_at).toLocaleDateString('en-KE', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    return `<tr>
      <td style="font-family:monospace;font-size:.8rem">#${shortId}</td>
      <td>${name}</td>
      <td style="max-width:200px;white-space:normal;font-size:.83rem">${items}</td>
      <td>${voucher}</td>
      <td>${total}</td>
      <td style="font-size:.8rem;color:var(--muted)">${date}</td>
    </tr>`;
  }).join('');
}

// ===== Reviews panel =====
async function loadReviews() {
  const tbody = document.getElementById('reviewsTableBody');
  const countEl = document.getElementById('reviewsCount');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="muted-cell">Loading…</td></tr>';
  const { data, error } = await supabaseClient
    .from('product_reviews')
    .select('*, products(name)')
    .order('created_at', { ascending: false });
  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted-cell">Error: ${error?.message}</td></tr>`;
    return;
  }
  if (countEl) countEl.textContent = `${data.length} review${data.length !== 1 ? 's' : ''}`;
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted-cell">No reviews yet.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(r => {
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    const product = r.products?.name || '—';
    const date = new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
    const status = r.approved
      ? '<span class="pill pill-green">Approved</span>'
      : '<span class="pill pill-yellow">Pending</span>';
    const approveBtn = !r.approved
      ? `<button class="action-btn" onclick="approveReview('${r.id}')">Approve</button>`
      : '';
    return `<tr>
      <td style="font-size:.83rem;max-width:120px">${escapeHtml(product)}</td>
      <td style="color:#f4a400">${stars}</td>
      <td>${escapeHtml(r.reviewer_name || '—')}</td>
      <td style="max-width:200px;white-space:normal;font-size:.83rem">${escapeHtml(r.body || '—')}</td>
      <td style="font-size:.8rem;color:var(--muted)">${date}</td>
      <td>${status}</td>
      <td class="action-cell">
        ${approveBtn}
        <button class="action-btn action-btn--danger" onclick="deleteReview('${r.id}')">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

window.approveReview = async (id) => {
  await supabaseClient.from('product_reviews').update({ approved: true }).eq('id', id);
  showToast('Review approved ✓');
  loadReviews();
};
window.deleteReview = async (id) => {
  if (!confirm('Delete this review?')) return;
  await supabaseClient.from('product_reviews').delete().eq('id', id);
  showToast('Review deleted');
  loadReviews();
};

// Add reviews panel to tab switching
document.querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.style.display = 'none');
    btn.classList.add('active');
    const panelId = 'panel' + btn.dataset.panel.charAt(0).toUpperCase() + btn.dataset.panel.slice(1);
    const panel = document.getElementById(panelId);
    if (panel) panel.style.display = 'block';
    if (btn.dataset.panel === 'promos')   loadPromoCodes();
    if (btn.dataset.panel === 'blog')     loadBlogPosts();
    if (btn.dataset.panel === 'orders')   loadOrders();
    if (btn.dataset.panel === 'reviews')  loadReviews();
  });
});

})();
