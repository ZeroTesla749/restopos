/**
 * RESTOPOS — app.js v2.0
 * ================================
 * KEY CHANGE: Órdenes activas persisten por mesa en localStorage.
 * Una orden está "activa" hasta que se paga o cancela.
 * Se puede editar/agregar items en cualquier momento.
 */

// ================================================================
// CONFIG
// ================================================================
const CFG = {
  get scriptUrl()  { return localStorage.getItem('rp_scriptUrl') || ''; },
  get businessName(){ return localStorage.getItem('rp_businessName') || 'Mi Restaurante'; },
  get businessRuc() { return localStorage.getItem('rp_businessRuc') || ''; },
  get businessAddress(){ return localStorage.getItem('rp_businessAddress') || ''; },
  get businessPhone(){ return localStorage.getItem('rp_businessPhone') || ''; },
  get numMesas()   { return parseInt(localStorage.getItem('rp_numMesas') || '10'); },
};

// ================================================================
// STATE — ACTIVE ORDERS (persisted in localStorage)
// ================================================================
// activeOrders: { [mesaKey]: { mesa, items:[{id,name,price,qty}], note, createdAt, updatedAt } }
// closedOrders: array of paid/cancelled orders (also synced to Google Sheets)

function loadActiveOrders() {
  try { return JSON.parse(localStorage.getItem('rp_activeOrders') || '{}'); }
  catch { return {}; }
}
function saveActiveOrders(orders) {
  localStorage.setItem('rp_activeOrders', JSON.stringify(orders));
}
function getActiveOrders() { return loadActiveOrders(); }

// ================================================================
// STATE (in-memory, session only)
// ================================================================
const STATE = {
  menu: [],
  categories: [],
  currentMesa: null,        // mesa key currently loaded in POS
  isEditingExisting: false, // whether POS is editing a saved active order
  selectedPayment: 'Efectivo',
  checkoutTargetMesa: null, // which mesa we're currently checking out
  charts: {},
  editingItemId: null,
};

// ================================================================
// UTILS
// ================================================================
const fmt = n => 'S/ ' + parseFloat(n || 0).toFixed(2);
const today = () => new Date().toISOString().split('T')[0];
const nowTime = () => new Date().toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
const nowFull = () => new Date().toLocaleString('es-PE');
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function setConnectionStatus(state) {
  const dot = document.querySelector('.status-dot');
  const txt = document.querySelector('.status-text');
  const states = { ok: ['connected','Conectado'], err: ['error','Sin conexión'], '': ['','Iniciando...'] };
  const [cls, label] = states[state] || states[''];
  dot.className = 'status-dot' + (cls ? ' '+cls : '');
  txt.textContent = label;
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ================================================================
// NAVIGATION
// ================================================================
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  const titles = { mesas:'Mesas', pos:'Punto de Venta', orders:'Historial de Ventas',
    dashboard:'Dashboard', expenses:'Gastos', invoices:'Comprobantes', admin:'Administración' };
  document.getElementById('pageTitle').textContent = titles[page] || '';

  if (page === 'mesas')     renderMesasGrid();
  if (page === 'orders')    loadClosedOrders();
  if (page === 'dashboard') loadDashboard();
  if (page === 'expenses')  loadExpenses();
  if (page === 'invoices')  loadInvoices();
  if (page === 'admin')     { loadAdminMenu(); loadConfig(); }

  if (window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open');
}

// ================================================================
// CLOCK
// ================================================================
function startClock() {
  const el = document.getElementById('dateTime');
  const tick = () => {
    const d = new Date();
    el.textContent = d.toLocaleDateString('es-PE',{weekday:'short',day:'2-digit',month:'short'})
      + ' ' + d.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});
  };
  tick(); setInterval(tick, 10000);
}

// ================================================================
// MESAS PAGE — the main hub
// ================================================================
function renderMesasGrid() {
  const grid = document.getElementById('mesasGrid');
  const activeOrders = getActiveOrders();
  const n = CFG.numMesas;

  let html = '';
  let activeCount = 0;

  for (let i = 1; i <= n; i++) {
    const key = `Mesa ${i}`;
    const order = activeOrders[key];
    const hasOrder = order && order.items && order.items.length > 0;
    if (hasOrder) activeCount++;

    const total = hasOrder ? order.items.reduce((s,o) => s + o.price * o.qty, 0) : 0;
    const itemCount = hasOrder ? order.items.reduce((s,o) => s + o.qty, 0) : 0;
    const stateClass = hasOrder ? 'busy' : 'free';
    const stateLabel = hasOrder ? 'Ocupada' : 'Libre';
    const elapsed = hasOrder ? getElapsed(order.updatedAt || order.createdAt) : '';

    html += `
      <div class="mesa-card ${stateClass}" onclick="mesaCardClick('${key}')">
        ${elapsed ? `<span class="mesa-time">${elapsed}</span>` : ''}
        <span class="mesa-icon">${hasOrder ? '🔴' : '🟢'}</span>
        <span class="mesa-num">${i}</span>
        <span class="mesa-state">${stateLabel}</span>
        ${hasOrder ? `<span class="mesa-total">${fmt(total)}</span>` : ''}
        ${hasOrder ? `<span class="mesa-items-count">${itemCount} ítem${itemCount !== 1 ? 's' : ''}</span>` : ''}
      </div>`;
  }

  grid.innerHTML = html || '<p style="color:var(--text3)">No hay mesas configuradas</p>';

  // Update badge
  const badge = document.getElementById('activeOrdersBadge');
  const count = document.getElementById('activeOrdersCount');
  if (activeCount > 0) { badge.style.display = 'inline-flex'; count.textContent = activeCount; }
  else { badge.style.display = 'none'; }
}

function getElapsed(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins/60)}h ${mins%60}m`;
}

function mesaCardClick(mesaKey) {
  const activeOrders = getActiveOrders();
  const order = activeOrders[mesaKey];

  if (order && order.items && order.items.length > 0) {
    // Show active order detail
    openActiveOrderModal(mesaKey);
  } else {
    // Start new order on this mesa
    startNewOrderOnMesa(mesaKey);
  }
}

// ================================================================
// ACTIVE ORDER MODAL (view/manage existing order)
// ================================================================
function openActiveOrderModal(mesaKey) {
  const activeOrders = getActiveOrders();
  const order = activeOrders[mesaKey];
  if (!order) return;

  document.getElementById('activeOrderModalTitle').textContent = `Orden — ${mesaKey}`;

  const total = order.items.reduce((s, o) => s + o.price * o.qty, 0);
  const elapsed = getElapsed(order.createdAt);

  const rows = order.items.map(o => `
    <div class="order-detail-row">
      <span class="order-detail-name">${o.name}</span>
      <span class="order-detail-qty">x${o.qty}</span>
      <span class="order-detail-price">${fmt(o.price * o.qty)}</span>
    </div>`).join('');

  // Show normal view (not confirm-cancel)
  document.getElementById('activeOrderModalBody').innerHTML = `
    <div class="order-detail-meta">📅 Abierta: ${order.createdAt ? new Date(order.createdAt).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}) : '—'} · ⏱ hace ${elapsed}</div>
    <div class="order-detail-items">${rows}</div>
    ${order.note ? `<div class="order-detail-meta">📝 Nota: ${order.note}</div>` : ''}
    <div class="order-detail-total"><span>TOTAL</span><span>${fmt(total)}</span></div>
  `;

  // Hide confirm-cancel state, show normal footer
  document.getElementById('activeOrderFooterNormal').style.display = 'flex';
  document.getElementById('activeOrderFooterConfirm').style.display = 'none';

  // Wire buttons
  document.getElementById('btnEditActiveOrder').onclick = () => {
    closeModal('activeOrderModal');
    loadOrderInPOS(mesaKey);
    navigate('pos');
  };

  // Cancel button: show inline confirmation (no confirm() popup)
  document.getElementById('btnCancelActiveOrder').onclick = () => {
    // Swap footer to confirm state
    document.getElementById('activeOrderFooterNormal').style.display = 'none';
    document.getElementById('activeOrderFooterConfirm').style.display = 'flex';
    document.getElementById('activeOrderModalBody').innerHTML += `
      <div class="cancel-confirm-box">
        ⚠️ ¿Seguro que deseas cancelar la orden de <strong>${mesaKey}</strong>? Se eliminará sin cobrar.
      </div>`;
  };

  document.getElementById('btnConfirmCancel').onclick = () => {
    cancelActiveOrder(mesaKey);
    closeModal('activeOrderModal');
  };

  document.getElementById('btnAbortCancel').onclick = () => {
    // Re-open the modal cleanly
    closeModal('activeOrderModal');
    openActiveOrderModal(mesaKey);
  };

  document.getElementById('btnCheckoutActiveOrder').onclick = () => {
    closeModal('activeOrderModal');
    openCheckoutForMesa(mesaKey);
  };

  document.getElementById('activeOrderModal').classList.add('open');
}

function cancelActiveOrder(mesaKey) {
  const activeOrders = getActiveOrders();
  delete activeOrders[mesaKey];
  saveActiveOrders(activeOrders);
  renderMesasGrid();
  showToast(`Orden de ${mesaKey} cancelada`, 'info');

  // If POS had this mesa loaded, clear it
  if (STATE.currentMesa === mesaKey) {
    STATE.currentMesa = null;
    STATE.isEditingExisting = false;
    renderPOSState();
  }
}

// ================================================================
// POS — OPEN / LOAD MESA
// ================================================================
function startNewOrderOnMesa(mesaKey) {
  STATE.currentMesa = mesaKey;
  STATE.isEditingExisting = false;
  renderPOSState();
  navigate('pos');
}

function loadOrderInPOS(mesaKey) {
  STATE.currentMesa = mesaKey;
  STATE.isEditingExisting = true;
  renderPOSState();
}

function renderPOSState() {
  const mesaKey = STATE.currentMesa;
  const activeOrders = getActiveOrders();

  if (!mesaKey) {
    document.getElementById('posMesaLabel').textContent = 'Sin mesa';
    document.getElementById('posOrderStatus').textContent = '';
    document.getElementById('posOrderStatus').className = 'pos-order-status';
    document.getElementById('orderTableBadge').textContent = '—';
    document.getElementById('orderPanelTitle').textContent = 'Orden';
    document.getElementById('orderMeta').textContent = 'Selecciona una mesa';
    document.getElementById('btnSaveOrder').style.display = '';
    document.getElementById('btnAddItemsExisting').style.display = 'none';
    renderOrderPanel([]);
    return;
  }

  const order = activeOrders[mesaKey];
  const items = order ? [...order.items] : [];
  const note = order ? (order.note || '') : '';

  document.getElementById('posMesaLabel').textContent = mesaKey;
  document.getElementById('orderTableBadge').textContent = mesaKey;
  document.getElementById('orderNote').value = note;

  if (STATE.isEditingExisting && order) {
    document.getElementById('posOrderStatus').textContent = '✏️ Editando orden guardada';
    document.getElementById('posOrderStatus').className = 'pos-order-status editing';
    document.getElementById('orderPanelTitle').textContent = 'Editando Orden';
    const t = new Date(order.createdAt);
    document.getElementById('orderMeta').textContent =
      `Abierta ${t.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})} · ${items.reduce((s,o)=>s+o.qty,0)} ítems`;
    document.getElementById('btnAddItemsExisting').style.display = 'inline-flex';
  } else {
    document.getElementById('posOrderStatus').textContent = '🆕 Nueva orden';
    document.getElementById('posOrderStatus').className = 'pos-order-status new';
    document.getElementById('orderPanelTitle').textContent = 'Nueva Orden';
    document.getElementById('orderMeta').textContent = mesaKey;
    document.getElementById('btnAddItemsExisting').style.display = 'none';
  }

  renderOrderPanel(items);
}

// ================================================================
// GET CURRENT ITEMS FROM POS PANEL (live, not from storage)
// ================================================================
function getCurrentPOSItems() {
  // Read from the rendered order panel's data attributes
  const rows = document.querySelectorAll('.order-item-row');
  const items = [];
  rows.forEach(row => {
    items.push({
      id: row.dataset.id,
      name: row.dataset.name,
      price: parseFloat(row.dataset.price),
      qty: parseInt(row.querySelector('.qty-num').textContent),
    });
  });
  return items;
}

// ================================================================
// ADD TO ORDER (from menu click)
// ================================================================
function addToOrder(itemId) {
  if (!STATE.currentMesa) {
    showPickMesaModal();
    return;
  }

  const item = STATE.menu.find(m => m.id == itemId);
  if (!item) return;

  // Flash animation
  const card = document.querySelector(`.item-card[data-id="${itemId}"]`);
  if (card) { card.classList.add('item-add-flash'); setTimeout(() => card.classList.remove('item-add-flash'), 350); }

  // Get current items in POS panel
  const items = getCurrentPOSItems();
  const existing = items.find(o => o.id == itemId);
  if (existing) { existing.qty++; }
  else { items.push({ id: item.id, name: item.name, price: parseFloat(item.price), qty: 1 }); }

  renderOrderPanel(items);
  showToast(`+1 ${item.name}`, 'success');
}

// ================================================================
// RENDER ORDER PANEL
// ================================================================
function renderOrderPanel(items) {
  const container = document.getElementById('orderItems');

  if (!STATE.currentMesa) {
    container.innerHTML = `<div class="order-empty"><span>🪑</span><p>Selecciona una mesa para empezar</p></div>`;
    updateTotals(0, 0);
    return;
  }

  if (!items.length) {
    container.innerHTML = `<div class="order-empty"><span>🛒</span><p>Agrega productos del menú</p></div>`;
    updateTotals(0, 0);
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="order-item-row"
         data-id="${item.id}" data-name="${item.name.replace(/"/g,'&quot;')}" data-price="${item.price}">
      <div class="order-item-name">${item.name}</div>
      <div class="order-item-qty">
        <button class="qty-btn" onclick="changePOSQty('${item.id}', -1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="changePOSQty('${item.id}', 1)">+</button>
      </div>
      <div class="order-item-price">${fmt(item.price * item.qty)}</div>
      <button class="order-item-del" onclick="removePOSItem('${item.id}')" title="Quitar">✕</button>
    </div>`).join('');

  const total = items.reduce((s, o) => s + o.price * o.qty, 0);
  const count = items.reduce((s, o) => s + o.qty, 0);
  updateTotals(total, count);
}

function changePOSQty(id, delta) {
  const items = getCurrentPOSItems();
  const item = items.find(o => o.id == id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    const filtered = items.filter(o => o.id != id);
    renderOrderPanel(filtered);
  } else {
    renderOrderPanel(items);
  }
}

function removePOSItem(id) {
  const items = getCurrentPOSItems().filter(o => o.id != id);
  renderOrderPanel(items);
}

function updateTotals(total, count) {
  document.getElementById('totalFinal').textContent = fmt(total);
  document.getElementById('totalItems').textContent = count + ' ítem' + (count !== 1 ? 's' : '');
}

// ================================================================
// SAVE ORDER (persist to localStorage, mesa stays "open")
// ================================================================
function saveCurrentOrder() {
  if (!STATE.currentMesa) { showToast('Selecciona una mesa', 'error'); return; }

  const items = getCurrentPOSItems();
  if (!items.length) { showToast('La orden está vacía', 'error'); return; }

  const note = document.getElementById('orderNote').value.trim();
  const activeOrders = getActiveOrders();
  const existing = activeOrders[STATE.currentMesa];

  activeOrders[STATE.currentMesa] = {
    mesa: STATE.currentMesa,
    items,
    note,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveActiveOrders(activeOrders);
  STATE.isEditingExisting = true;
  renderPOSState(); // refresh status label

  renderMesasGrid(); // update mesa grid too
  showToast(`✅ Orden de ${STATE.currentMesa} guardada`, 'success');
}

// ================================================================
// MESA PICKER MODAL
// ================================================================
function showPickMesaModal() {
  const activeOrders = getActiveOrders();
  const grid = document.getElementById('mesaPickerGrid');
  let html = '';
  for (let i = 1; i <= CFG.numMesas; i++) {
    const key = `Mesa ${i}`;
    const busy = activeOrders[key] && activeOrders[key].items && activeOrders[key].items.length > 0;
    const total = busy ? activeOrders[key].items.reduce((s,o)=>s+o.price*o.qty,0) : 0;
    html += `
      <button class="mesa-picker-btn ${busy ? 'busy' : 'free'}"
              onclick="pickMesaFromModal('${key}')">
        ${i}
        ${busy ? `<span class="mesa-picker-sub">${fmt(total)}</span>` : '<span class="mesa-picker-sub">libre</span>'}
      </button>`;
  }
  grid.innerHTML = html;
  document.getElementById('mesaPickerModal').classList.add('open');
}

function pickMesaFromModal(mesaKey) {
  closeModal('mesaPickerModal');
  const activeOrders = getActiveOrders();
  const existing = activeOrders[mesaKey];

  if (existing && existing.items && existing.items.length > 0) {
    // Mesa has order — load it for editing
    STATE.currentMesa = mesaKey;
    STATE.isEditingExisting = true;
    renderPOSState();
    showToast(`Cargando orden de ${mesaKey}`, 'info');
  } else {
    // Empty mesa — start new
    STATE.currentMesa = mesaKey;
    STATE.isEditingExisting = false;
    renderPOSState();
  }
}

// ================================================================
// CHECKOUT
// ================================================================
function openCheckoutForMesa(mesaKey) {
  const activeOrders = getActiveOrders();
  const order = activeOrders[mesaKey];

  if (!order || !order.items || !order.items.length) {
    showToast('No hay items en esta orden', 'error');
    return;
  }

  STATE.checkoutTargetMesa = mesaKey;

  // Build checkout summary
  const sum = document.getElementById('checkoutSummary');
  sum.innerHTML = order.items.map(o =>
    `<div class="checkout-summary-row"><span>${o.qty}× ${o.name}</span><span>${fmt(o.price*o.qty)}</span></div>`
  ).join('');
  if (order.note) {
    sum.innerHTML += `<div class="checkout-summary-row" style="color:var(--text3);font-style:italic"><span>📝 ${order.note}</span></div>`;
  }

  const total = order.items.reduce((s, o) => s + o.price * o.qty, 0);
  document.getElementById('checkoutTotal').textContent = fmt(total);
  document.getElementById('checkoutMesaTag').textContent = `🪑 ${mesaKey}`;
  document.getElementById('cashReceived').value = '';
  document.getElementById('changeDisplay').textContent = 'Vuelto: S/ 0.00';
  document.getElementById('invoiceType').value = 'Ticket';
  document.getElementById('invoiceClientData').style.display = 'none';
  document.getElementById('clientName').value = '';
  document.getElementById('clientDoc').value = '';

  // Reset payment selection
  document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.pay-btn[data-method="Efectivo"]').classList.add('active');
  STATE.selectedPayment = 'Efectivo';
  document.getElementById('cashChangeGroup').style.display = 'block';

  document.getElementById('checkoutModal').classList.add('open');
}

function openCheckoutFromPOS() {
  // Auto-save current POS state first, then checkout
  if (!STATE.currentMesa) { showToast('Selecciona una mesa', 'error'); return; }
  const items = getCurrentPOSItems();
  if (!items.length) { showToast('La orden está vacía', 'error'); return; }

  // Save current state to active orders
  const note = document.getElementById('orderNote').value.trim();
  const activeOrders = getActiveOrders();
  const existing = activeOrders[STATE.currentMesa];
  activeOrders[STATE.currentMesa] = {
    mesa: STATE.currentMesa, items, note,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveActiveOrders(activeOrders);

  openCheckoutForMesa(STATE.currentMesa);
}

async function confirmCheckoutAction() {
  const mesaKey = STATE.checkoutTargetMesa;
  if (!mesaKey) return;

  const activeOrders = getActiveOrders();
  const order = activeOrders[mesaKey];
  if (!order) return;

  const total = order.items.reduce((s, o) => s + o.price * o.qty, 0);
  const invoiceType = document.getElementById('invoiceType').value;
  const clientName = document.getElementById('clientName').value.trim();
  const clientDoc = document.getElementById('clientDoc').value.trim();

  const closedOrder = {
    id: genId(),
    mesa: mesaKey,
    items: order.items.map(o => `${o.qty}x ${o.name}`).join(', '),
    itemsDetail: JSON.stringify(order.items),
    note: order.note || '',
    total,
    payment: STATE.selectedPayment,
    invoiceType,
    clientName,
    clientDoc,
    date: today(),
    time: nowTime(),
    createdAt: order.createdAt,
    closedAt: new Date().toISOString(),
    status: 'Pagado',
  };

  const btn = document.getElementById('confirmCheckout');
  btn.disabled = true; btn.textContent = 'Procesando...';

  try {
    // Save to Google Sheets (if connected) or localStorage
    await persistClosedOrder(closedOrder);

    // Remove from active orders
    delete activeOrders[mesaKey];
    saveActiveOrders(activeOrders);

    closeModal('checkoutModal');
    renderMesasGrid();

    // Clear POS if it was this mesa
    if (STATE.currentMesa === mesaKey) {
      STATE.currentMesa = null;
      STATE.isEditingExisting = false;
      renderPOSState();
    }

    // Show receipt
    showReceipt(closedOrder);
    showToast(`✅ ${mesaKey} — Pago confirmado`, 'success');

  } catch (e) {
    showToast('Error al cerrar cuenta: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '✅ Confirmar Pago';
  }
}

// ================================================================
// PERSIST CLOSED ORDER (to Sheets or localStorage)
// ================================================================
async function persistClosedOrder(order) {
  if (CFG.scriptUrl) {
    await api('saveOrder', { order });
  }
  // Always save locally too (for receipts / offline)
  const local = JSON.parse(localStorage.getItem('rp_closedOrders') || '[]');
  local.unshift(order); // newest first
  localStorage.setItem('rp_closedOrders', JSON.stringify(local.slice(0, 500)));
}

// ================================================================
// RECEIPT
// ================================================================
function showReceipt(order) {
  const lines = JSON.parse(order.itemsDetail || '[]');
  const D = '─'.repeat(40);
  const biz = CFG.businessName.toUpperCase().padStart(Math.floor((40 + CFG.businessName.length) / 2));
  const type = order.invoiceType.toUpperCase();
  const itemsText = lines.map(o =>
    `${String(o.qty+'x').padEnd(4)}${o.name.substring(0,22).padEnd(22)}${fmt(o.price*o.qty).padStart(10)}`
  ).join('\n');

  let clientSection = '';
  if (order.invoiceType !== 'Ticket' && order.clientName) {
    clientSection = `\nCliente: ${order.clientName}\nDoc:     ${order.clientDoc}\n`;
  }

  const text = `
${biz}
${CFG.businessAddress || ''}
${CFG.businessRuc ? 'RUC: ' + CFG.businessRuc : ''}
${CFG.businessPhone ? 'Tel: ' + CFG.businessPhone : ''}
${D}
            ${type}
${D}
${order.mesa}                    ${order.date} ${order.time}
${D}
CANT PRODUCTO                    IMPORTE
${D}
${itemsText}
${D}
${order.note ? 'Nota: ' + order.note + '\n' + D : ''}
                TOTAL: ${fmt(order.total).padStart(9)}
${D}
Pago: ${order.payment}${clientSection}

      ¡Gracias por su visita!
${D}`.trim();

  document.getElementById('receiptContent').textContent = text;

  // Save invoice record
  const invs = JSON.parse(localStorage.getItem('rp_invoices') || '[]');
  invs.unshift({
    id: order.id, type: order.invoiceType, mesa: order.mesa,
    client: order.clientName || '—', total: order.total,
    payment: order.payment, date: order.date, time: order.time,
    receipt: text
  });
  localStorage.setItem('rp_invoices', JSON.stringify(invs.slice(0, 500)));

  document.getElementById('receiptModal').classList.add('open');
}

// ================================================================
// CLOSED ORDERS (History page)
// ================================================================
function loadClosedOrders() {
  // Ensure date filter always has today if empty
  const filterEl = document.getElementById('ordersDateFilter');
  if (!filterEl.value) filterEl.value = today();
  const dateFilter = filterEl.value;
  const statusFilter = document.getElementById('ordersStatusFilter').value;

  document.getElementById('ordersTbody').innerHTML =
    '<tr><td colspan="8" class="loading-row">Cargando...</td></tr>';

  if (CFG.scriptUrl) {
    api('getOrders', { date: dateFilter }).then(res => {
      let orders = res.orders || [];
      if (statusFilter) orders = orders.filter(o => o.status === statusFilter);
      // Also merge with any local orders not yet in Sheets (same date)
      const localOrders = getLocalClosedOrders(dateFilter, statusFilter);
      const sheetsIds = new Set(orders.map(o => String(o.id)));
      const onlyLocal = localOrders.filter(o => !sheetsIds.has(String(o.id)));
      const merged = [...orders, ...onlyLocal];
      renderOrdersTable(merged, dateFilter);
    }).catch(err => {
      // Show error but also load from localStorage so data isn't lost
      showToast('⚠️ Error al leer Sheets: ' + err.message + ' — mostrando datos locales', 'error');
      renderOrdersTable(getLocalClosedOrders(dateFilter, statusFilter), dateFilter);
    });
    return;
  }
  const orders = getLocalClosedOrders(dateFilter, statusFilter);
  renderOrdersTable(orders, dateFilter);
}

function getLocalClosedOrders(dateFilter, statusFilter) {
  let orders = JSON.parse(localStorage.getItem('rp_closedOrders') || '[]');
  if (dateFilter && dateFilter.trim() !== '') {
    orders = orders.filter(o => o.date === dateFilter);
  }
  if (statusFilter && statusFilter.trim() !== '') {
    orders = orders.filter(o => o.status === statusFilter);
  }
  return orders;
}

function renderOrdersTable(orders, dateLabel) {
  const tbody = document.getElementById('ordersTbody');
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">
      No hay ventas para ${dateLabel || 'este período'}.<br>
      <small style="color:var(--text3)">Borra la fecha y haz clic en Filtrar para ver todas.</small>
    </td></tr>`;
    document.getElementById('ordersSummary').innerHTML = '';
    return;
  }

  // Normalize field access — Sheets may lowercase headers differently
  const g = (o, ...keys) => {
    for (const k of keys) { if (o[k] !== undefined && o[k] !== '') return o[k]; }
    return '';
  };

  tbody.innerHTML = orders.map((o, i) => {
    const mesa    = g(o, 'mesa', 'Mesa');
    const items   = g(o, 'items', 'Items', 'productos');
    const total   = parseFloat(g(o, 'total', 'Total') || 0);
    const payment = g(o, 'payment', 'Payment', 'pago', 'metodo');
    const time    = g(o, 'time', 'Time', 'hora');
    const status  = g(o, 'status', 'Status', 'estado') || 'Pagado';
    const id      = g(o, 'id', 'Id');
    return `
    <tr>
      <td>${i+1}</td>
      <td><strong>${mesa}</strong></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${items}">${items || '—'}</td>
      <td><strong style="color:var(--accent)">${fmt(total)}</strong></td>
      <td><span class="badge badge-pending">${payment}</span></td>
      <td>${time}</td>
      <td><span class="badge badge-paid">${status}</span></td>
      <td><button class="link-btn" onclick="viewReceiptById('${id}')">🧾 Ver</button></td>
    </tr>`; }).join('');

  const totalVentas = orders.reduce((s, o) => s + parseFloat(g(o,'total','Total') || 0), 0);
  const byMethod = {};
  orders.forEach(o => {
    const m = g(o,'payment','Payment','pago') || 'Otro';
    byMethod[m] = (byMethod[m]||0) + parseFloat(g(o,'total','Total')||0);
  });

  document.getElementById('ordersSummary').innerHTML = `
    <div class="summary-chip">📋 Órdenes: <strong>${orders.length}</strong></div>
    <div class="summary-chip">💵 Total: <strong>${fmt(totalVentas)}</strong></div>
    ${Object.entries(byMethod).map(([k,v]) => `<div class="summary-chip">${k}: <strong>${fmt(v)}</strong></div>`).join('')}`;
}

function viewReceiptById(id) {
  const invs = JSON.parse(localStorage.getItem('rp_invoices') || '[]');
  const inv = invs.find(i => i.id === id);
  if (inv) {
    document.getElementById('receiptContent').textContent = inv.receipt;
    document.getElementById('receiptModal').classList.add('open');
  } else {
    showToast('Comprobante no disponible', 'info');
  }
}

// ================================================================
// EXPENSES
// ================================================================
function loadExpenses() {
  let expenses = JSON.parse(localStorage.getItem('rp_expenses') || '[]');
  if (CFG.scriptUrl) {
    api('getExpenses').then(res => {
      renderExpensesTable(res.expenses || []);
    }).catch(() => renderExpensesTable(expenses));
    return;
  }
  renderExpensesTable(expenses);
}

function renderExpensesTable(expenses) {
  const tbody = document.getElementById('expensesTbody');
  if (!expenses.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="loading-row">No hay gastos registrados</td></tr>';
    document.getElementById('expensesSummary').innerHTML = '';
    return;
  }

  const total = expenses.reduce((s, e) => s + parseFloat(e.amount||0), 0);
  const byCat = {};
  expenses.forEach(e => { byCat[e.category] = (byCat[e.category]||0) + parseFloat(e.amount||0); });

  document.getElementById('expensesSummary').innerHTML = `
    <div class="summary-chip">Total Gastos: <strong style="color:var(--red)">${fmt(total)}</strong></div>
    ${Object.entries(byCat).map(([k,v]) => `<div class="summary-chip">${k}: <strong>${fmt(v)}</strong></div>`).join('')}`;

  tbody.innerHTML = expenses.sort((a,b) => (b.date||'') > (a.date||'') ? 1 : -1).map(e => `
    <tr>
      <td>${e.date}</td>
      <td><span class="badge badge-cancel">${e.category}</span></td>
      <td>${e.desc}</td>
      <td><strong style="color:var(--red)">${fmt(e.amount)}</strong></td>
    </tr>`).join('');
}

async function saveExpense() {
  const cat = document.getElementById('expCat').value;
  const desc = document.getElementById('expDesc').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const date = document.getElementById('expDate').value;
  if (!desc || !amount || !date) { showToast('Completa todos los campos', 'error'); return; }

  const expense = { id: genId(), category: cat, desc, amount, date };

  try {
    if (CFG.scriptUrl) await api('saveExpense', { expense });
    const local = JSON.parse(localStorage.getItem('rp_expenses') || '[]');
    local.unshift(expense);
    localStorage.setItem('rp_expenses', JSON.stringify(local));
    showToast('Gasto registrado', 'success');
    document.getElementById('expenseForm').style.display = 'none';
    loadExpenses();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ================================================================
// INVOICES (Comprobantes page)
// ================================================================
function loadInvoices() {
  const dateFilter = document.getElementById('invDateFilter').value;
  const typeFilter = document.getElementById('invTypeFilter').value;
  let invs = JSON.parse(localStorage.getItem('rp_invoices') || '[]');
  // Only filter by date if a date is actually set
  if (dateFilter && dateFilter.trim() !== '') {
    invs = invs.filter(i => i.date === dateFilter);
  }
  if (typeFilter && typeFilter.trim() !== '') {
    invs = invs.filter(i => i.type === typeFilter);
  }
  const tbody = document.getElementById('invoicesTbody');
  if (!invs.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-row">No hay comprobantes</td></tr>';
    return;
  }
  tbody.innerHTML = invs.map((inv, i) => `
    <tr>
      <td>${i+1}</td>
      <td><span class="badge badge-${inv.type?.toLowerCase() || 'ticket'}">${inv.type || 'Ticket'}</span></td>
      <td>${inv.mesa || '—'}</td>
      <td>${inv.client || '—'}</td>
      <td>${fmt(inv.total)}</td>
      <td><span class="badge badge-pending">${inv.payment || '—'}</span></td>
      <td style="white-space:nowrap">${inv.date || ''} ${inv.time || ''}</td>
      <td>
        <button class="link-btn" onclick="showInvoiceById('${inv.id}')">Ver</button>
        <button class="link-btn" style="margin-left:6px" onclick="printInvoiceById('${inv.id}')">🖨</button>
      </td>
    </tr>`).join('');
}

function showInvoiceById(id) {
  const invs = JSON.parse(localStorage.getItem('rp_invoices') || '[]');
  const inv = invs.find(i => i.id === id);
  if (inv) { document.getElementById('receiptContent').textContent = inv.receipt; document.getElementById('receiptModal').classList.add('open'); }
}
function printInvoiceById(id) { showInvoiceById(id); setTimeout(() => window.print(), 400); }

// ================================================================
// DASHBOARD
// ================================================================
async function loadDashboard() {
  const period = document.getElementById('dashPeriod').value;
  document.getElementById('kpiVentas').textContent = '...';

  try {
    let orders, expenses;
    if (CFG.scriptUrl) {
      [orders, expenses] = await Promise.all([
        api('getOrders', { period }).then(r => r.orders || []),
        api('getExpenses', { period }).then(r => r.expenses || [])
      ]);
    } else {
      const now2 = new Date();
      const allOrders = JSON.parse(localStorage.getItem('rp_closedOrders') || '[]');
      const allExpenses = JSON.parse(localStorage.getItem('rp_expenses') || '[]');
      const inPeriod = (dateStr) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (period === 'day') return dateStr === today();
        if (period === 'month') return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear();
        if (period === 'year') return d.getFullYear() === now2.getFullYear();
        return true;
      };
      orders = allOrders.filter(o => inPeriod(o.date));
      expenses = allExpenses.filter(e => inPeriod(e.date));
    }

    const totalVentas = orders.reduce((s, o) => s + parseFloat(o.total||0), 0);
    const totalGastos = expenses.reduce((s, e) => s + parseFloat(e.amount||0), 0);
    const ganancia = totalVentas - totalGastos;
    const ip = totalGastos > 0 ? ((ganancia / totalGastos) * 100).toFixed(1) + '%' : '—';
    const ticketProm = orders.length > 0 ? totalVentas / orders.length : 0;

    document.getElementById('kpiVentas').textContent = fmt(totalVentas);
    document.getElementById('kpiGastos').textContent = fmt(totalGastos);
    document.getElementById('kpiGanancia').textContent = fmt(ganancia);
    document.getElementById('kpiProductividad').textContent = ip;
    document.getElementById('kpiOrdenes').textContent = orders.length;
    document.getElementById('kpiTicketProm').textContent = fmt(ticketProm);

    buildCharts(orders, expenses, totalVentas, totalGastos);
  } catch (e) {
    showToast('Error dashboard: ' + e.message, 'error');
  }
}

function buildCharts(orders, expenses, totalVentas, totalGastos) {
  Object.values(STATE.charts).forEach(c => c?.destroy());

  const textColor = '#a09a92';
  const gridColor = '#2a2a2a';

  const payMethods = {};
  orders.forEach(o => { payMethods[o.payment] = (payMethods[o.payment]||0) + parseFloat(o.total||0); });

  const c1 = document.getElementById('chartPago');
  if (c1) STATE.charts.pago = new Chart(c1, {
    type: 'doughnut',
    data: { labels: Object.keys(payMethods), datasets: [{ data: Object.values(payMethods), backgroundColor: ['#e8a45a','#9b72e8','#4caf7d','#5b8dee'], borderWidth: 0 }] },
    options: { plugins: { legend: { labels: { color: textColor, font:{size:11} } } } }
  });

  const prodCount = {};
  orders.forEach(o => {
    try { JSON.parse(o.itemsDetail||'[]').forEach(i => { prodCount[i.name] = (prodCount[i.name]||0) + i.qty; }); } catch {}
  });
  const sorted = Object.entries(prodCount).sort((a,b)=>b[1]-a[1]).slice(0,6);

  const c2 = document.getElementById('chartProductos');
  if (c2) STATE.charts.productos = new Chart(c2, {
    type: 'bar',
    data: { labels: sorted.map(s=>s[0]), datasets: [{ label:'Vendidos', data: sorted.map(s=>s[1]), backgroundColor:'#e8a45a99', borderColor:'#e8a45a', borderWidth:2, borderRadius:4 }] },
    options: { plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:textColor,font:{size:10}},grid:{color:gridColor}}, y:{ticks:{color:textColor},grid:{color:gridColor}} } }
  });

  const expCats = {};
  expenses.forEach(e => { expCats[e.category] = (expCats[e.category]||0) + parseFloat(e.amount||0); });

  const c3 = document.getElementById('chartVentasGastos');
  if (c3) STATE.charts.vg = new Chart(c3, {
    type: 'bar',
    data: {
      labels: ['Ventas', 'Gastos', 'Ganancia', ...Object.keys(expCats)],
      datasets: [{
        label: 'S/',
        data: [totalVentas, totalGastos, totalVentas-totalGastos, ...Object.values(expCats)],
        backgroundColor: ['#4caf7d88','#e0555588','#e8a45a88', ...Object.keys(expCats).map(()=>'#5b8dee44')],
        borderColor: ['#4caf7d','#e05555','#e8a45a', ...Object.keys(expCats).map(()=>'#5b8dee')],
        borderWidth: 2, borderRadius: 4,
      }]
    },
    options: { plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:textColor,font:{size:10}},grid:{color:gridColor}}, y:{ticks:{color:textColor,callback:v=>'S/'+v},grid:{color:gridColor}} } }
  });
}

// ================================================================
// MENU LOADING
// ================================================================
async function loadMenu() {
  try {
    let items;
    if (CFG.scriptUrl) {
      const res = await api('getMenu');
      items = res.items || [];
      setConnectionStatus('ok');
    } else {
      items = getDemoMenu();
      setConnectionStatus('err');
    }
    if (!items.length) items = getDemoMenu();
    STATE.menu = items;
    buildCategoryTabs(items);
    renderMenuItems(items);
  } catch (e) {
    STATE.menu = getDemoMenu();
    buildCategoryTabs(STATE.menu);
    renderMenuItems(STATE.menu);
    setConnectionStatus('err');
  }
}

function getDemoMenu() {
  return [
    {id:'1',name:'Ceviche Mixto',price:28,category:'Comidas',image:'',desc:'Ceviche de mariscos',available:'SI'},
    {id:'2',name:'Lomo Saltado',price:22,category:'Comidas',image:'',desc:'Clásico peruano',available:'SI'},
    {id:'3',name:'Arroz con Pollo',price:20,category:'Comidas',image:'',desc:'Plato principal',available:'SI'},
    {id:'4',name:'Causa Limeña',price:14,category:'Entradas',image:'',desc:'Entrada fría',available:'SI'},
    {id:'5',name:'Anticuchos',price:16,category:'Entradas',image:'',desc:'Brocheta',available:'SI'},
    {id:'6',name:'Inca Kola 500ml',price:4,category:'Bebidas',image:'',desc:'Gaseosa',available:'SI'},
    {id:'7',name:'Chicha Morada',price:5,category:'Bebidas',image:'',desc:'Bebida tradicional',available:'SI'},
    {id:'8',name:'Agua Mineral',price:3,category:'Bebidas',image:'',desc:'500ml',available:'SI'},
    {id:'9',name:'Arroz con Leche',price:6,category:'Postres',image:'',desc:'Postre clásico',available:'SI'},
    {id:'10',name:'Suspiro Limeño',price:7,category:'Postres',image:'',desc:'Postre clásico',available:'SI'},
    {id:'11',name:'Chicharrón de Pescado',price:18,category:'Entradas',image:'',desc:'Frito crujiente',available:'SI'},
    {id:'12',name:'Jugo de Maracuyá',price:6,category:'Bebidas',image:'',desc:'Natural',available:'SI'},
  ];
}

function buildCategoryTabs(items) {
  const cats = ['Todos', ...new Set(items.map(i => i.category).filter(Boolean))];
  const tabs = document.getElementById('catTabs');
  tabs.innerHTML = cats.map((c, idx) =>
    `<button class="cat-tab${idx===0?' active':''}" data-cat="${c}" onclick="filterByCategory('${c}',this)">${c}</button>`
  ).join('');
}

function filterByCategory(cat, el) {
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const filtered = cat === 'Todos' ? STATE.menu : STATE.menu.filter(m => m.category === cat);
  renderMenuItems(filtered);
}

function renderMenuItems(items) {
  const grid = document.getElementById('itemsGrid');
  const emojis = {Comidas:'🍽',Bebidas:'🥤',Postres:'🍮',Entradas:'🥗'};
  const available = items.filter(i => i.available !== 'NO');
  if (!available.length) { grid.innerHTML = '<div class="loading-items">Sin productos en esta categoría</div>'; return; }

  grid.innerHTML = available.map(item => `
    <div class="item-card" data-id="${item.id}" onclick="addToOrder('${item.id}')">
      <div class="item-img">
        ${item.image
          ? `<img src="${item.image}" alt="${item.name}" loading="lazy" onerror="this.parentElement.innerHTML='${emojis[item.category]||'🍽'}'">` 
          : (emojis[item.category]||'🍽')}
      </div>
      <span class="item-cat-badge">${item.category||''}</span>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-price">${fmt(item.price)}</div>
      </div>
    </div>`).join('');
}

// ================================================================
// MENU SEARCH
// ================================================================
function handleMenuSearch(q) {
  const query = q.toLowerCase().trim();
  if (!query) { renderMenuItems(STATE.menu); return; }
  const filtered = STATE.menu.filter(m =>
    m.name.toLowerCase().includes(query) || (m.category||'').toLowerCase().includes(query)
  );
  renderMenuItems(filtered);
}

// ================================================================
// ADMIN — MENU MANAGEMENT
// ================================================================
async function loadAdminMenu() {
  document.getElementById('menuAdminGrid').innerHTML = '<div class="loading-items">Cargando...</div>';
  try {
    let items;
    if (CFG.scriptUrl) { const r = await api('getMenu'); items = r.items || []; }
    else { items = STATE.menu.length ? STATE.menu : getDemoMenu(); }
    STATE.menu = items;
    renderAdminMenuGrid(items);
    const cats = [...new Set(items.map(i => i.category).filter(Boolean))];
    const sel = document.getElementById('filterCatAdmin');
    sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c=>`<option>${c}</option>`).join('');
  } catch (e) {
    document.getElementById('menuAdminGrid').innerHTML = `<div class="loading-items">Error: ${e.message}</div>`;
  }
}

function renderAdminMenuGrid(items) {
  const emojis = {Comidas:'🍽',Bebidas:'🥤',Postres:'🍮',Entradas:'🥗'};
  const grid = document.getElementById('menuAdminGrid');
  if (!items.length) { grid.innerHTML = '<div class="loading-items">No hay productos</div>'; return; }
  grid.innerHTML = items.map(item => `
    <div class="menu-admin-card">
      <div class="item-img">
        ${item.image ? `<img src="${item.image}" alt="${item.name}" onerror="this.parentElement.innerHTML='${emojis[item.category]||'🍽'}'">` : (emojis[item.category]||'🍽')}
      </div>
      <div class="menu-admin-info">
        <div class="menu-admin-name">${item.name}</div>
        <div class="menu-admin-price">${fmt(item.price)}</div>
        <div class="menu-admin-cat">${item.category} · ${item.available==='NO'?'❌ No disp.':'✅ Disponible'}</div>
      </div>
      <div class="menu-admin-actions">
        <button class="btn-edit" onclick="editItem('${item.id}')">✏️ Editar</button>
        <button class="btn-del" onclick="deleteItem('${item.id}')">🗑</button>
      </div>
    </div>`).join('');
}

function editItem(id) {
  const item = STATE.menu.find(m => m.id == id);
  if (!item) return;
  document.getElementById('itemFormTitle').textContent = 'Editar Producto';
  document.getElementById('itemName').value = item.name;
  document.getElementById('itemPrice').value = item.price;
  document.getElementById('itemCat').value = item.category;
  document.getElementById('itemImage').value = item.image || '';
  document.getElementById('itemDesc').value = item.desc || '';
  document.getElementById('itemAvail').value = item.available || 'SI';
  STATE.editingItemId = id;
  document.getElementById('itemForm').style.display = 'block';
  document.getElementById('itemForm').scrollIntoView({behavior:'smooth'});
}

async function deleteItem(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  try {
    if (CFG.scriptUrl) await api('deleteMenuItem', { id });
    STATE.menu = STATE.menu.filter(m => m.id != id);
    loadAdminMenu();
    showToast('Producto eliminado', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function saveItem() {
  const name = document.getElementById('itemName').value.trim();
  const price = parseFloat(document.getElementById('itemPrice').value);
  const category = document.getElementById('itemCat').value.trim();
  const image = document.getElementById('itemImage').value.trim();
  const desc = document.getElementById('itemDesc').value.trim();
  const available = document.getElementById('itemAvail').value;
  if (!name || !price || !category) { showToast('Nombre, precio y categoría son obligatorios', 'error'); return; }

  const item = { id: STATE.editingItemId || genId(), name, price, category, image, desc, available };
  try {
    if (CFG.scriptUrl) await api('saveMenuItem', { item });
    if (STATE.editingItemId) {
      const idx = STATE.menu.findIndex(m => m.id == STATE.editingItemId);
      if (idx >= 0) STATE.menu[idx] = item; else STATE.menu.push(item);
    } else { STATE.menu.push(item); }
    document.getElementById('itemForm').style.display = 'none';
    STATE.editingItemId = null;
    loadAdminMenu();
    buildCategoryTabs(STATE.menu);
    renderMenuItems(STATE.menu);
    showToast('Producto guardado', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ================================================================
// CONFIG
// ================================================================
function loadConfig() {
  document.getElementById('scriptUrl').value = CFG.scriptUrl;
  document.getElementById('businessName').value = CFG.businessName;
  document.getElementById('businessRuc').value = CFG.businessRuc;
  document.getElementById('businessAddress').value = CFG.businessAddress;
  document.getElementById('businessPhone').value = CFG.businessPhone;
  document.getElementById('numMesas').value = CFG.numMesas;
  previewMesas();
}

function saveConfig() {
  localStorage.setItem('rp_scriptUrl', document.getElementById('scriptUrl').value.trim());
  localStorage.setItem('rp_businessName', document.getElementById('businessName').value.trim());
  localStorage.setItem('rp_businessRuc', document.getElementById('businessRuc').value.trim());
  localStorage.setItem('rp_businessAddress', document.getElementById('businessAddress').value.trim());
  localStorage.setItem('rp_businessPhone', document.getElementById('businessPhone').value.trim());
  showToast('Configuración guardada', 'success');
}

async function testConnection() {
  const url = document.getElementById('scriptUrl').value.trim();
  if (!url) { showToast('Ingresa la URL primero', 'error'); return; }
  localStorage.setItem('rp_scriptUrl', url);
  try {
    const res = await api('ping');
    showToast('✅ Conexión exitosa: ' + (res.msg || 'OK'), 'success');
    setConnectionStatus('ok');
  } catch (e) {
    showToast('❌ Sin conexión: ' + e.message, 'error');
    setConnectionStatus('err');
  }
}

function previewMesas() {
  const n = parseInt(document.getElementById('numMesas').value) || CFG.numMesas;
  const container = document.getElementById('mesasPreview');
  container.innerHTML = Array.from({length:n}, (_,i) =>
    `<div class="mesa-chip-prev">Mesa ${i+1}</div>`).join('');
}

// ================================================================
// GOOGLE SHEETS API
// ================================================================
async function api(action, payload = {}) {
  const url = CFG.scriptUrl;
  if (!url) throw new Error('URL no configurada');
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
    headers: { 'Content-Type': 'text/plain' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

// ================================================================
// INIT — EVENT LISTENERS
// ================================================================
document.addEventListener('DOMContentLoaded', () => {

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); navigate(item.dataset.page); });
  });

  // Mobile sidebar
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Mesas page
  document.getElementById('btnNewQuickOrder').addEventListener('click', () => {
    navigate('pos');
    showPickMesaModal();
  });
  document.getElementById('btnRefreshMesas')?.addEventListener('click', renderMesasGrid);

  // POS — mesa picker
  document.getElementById('btnPickMesa').addEventListener('click', showPickMesaModal);

  // POS — save order
  document.getElementById('btnSaveOrder').addEventListener('click', saveCurrentOrder);

  // POS — checkout
  document.getElementById('btnCheckout').addEventListener('click', openCheckoutFromPOS);

  // POS — menu search
  document.getElementById('menuSearch').addEventListener('input', e => handleMenuSearch(e.target.value));

  // Payment methods
  document.querySelectorAll('.pay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.selectedPayment = btn.dataset.method;
      document.getElementById('cashChangeGroup').style.display = btn.dataset.method === 'Efectivo' ? 'block' : 'none';
    });
  });

  // Cash change calculator
  document.getElementById('cashReceived').addEventListener('input', e => {
    const received = parseFloat(e.target.value) || 0;
    const totalText = document.getElementById('checkoutTotal').textContent.replace('S/ ', '');
    const total = parseFloat(totalText) || 0;
    const change = received - total;
    const el = document.getElementById('changeDisplay');
    el.textContent = `Vuelto: ${fmt(Math.max(0, change))}`;
    el.style.color = change >= 0 ? 'var(--green)' : 'var(--red)';
  });

  // Invoice type toggle
  document.getElementById('invoiceType').addEventListener('change', e => {
    document.getElementById('invoiceClientData').style.display = e.target.value !== 'Ticket' ? 'block' : 'none';
  });

  // Confirm checkout
  document.getElementById('confirmCheckout').addEventListener('click', confirmCheckoutAction);

  // Receipt print
  document.getElementById('btnPrintReceipt').addEventListener('click', () => window.print());

  // Historial filters
  document.getElementById('ordersDateFilter').value = today();
  document.getElementById('btnFilterOrders').addEventListener('click', loadClosedOrders);

  // Dashboard
  document.getElementById('btnDashLoad').addEventListener('click', loadDashboard);

  // Expenses
  document.getElementById('btnAddExpense').addEventListener('click', () => {
    document.getElementById('expenseForm').style.display = 'block';
    document.getElementById('expDate').value = today();
    document.getElementById('expDesc').focus();
  });
  document.getElementById('btnCancelExpense').addEventListener('click', () => {
    document.getElementById('expenseForm').style.display = 'none';
  });
  document.getElementById('btnSaveExpense').addEventListener('click', saveExpense);

  // Invoices
  document.getElementById('invDateFilter').value = today();
  document.getElementById('btnFilterInv').addEventListener('click', loadInvoices);

  // Admin tabs
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`atab-${tab.dataset.atab}`)?.classList.add('active');
    });
  });

  // Admin config
  document.getElementById('btnSaveConfig').addEventListener('click', saveConfig);
  document.getElementById('btnTestConnection').addEventListener('click', testConnection);

  // Admin menu
  document.getElementById('btnAddItem').addEventListener('click', () => {
    document.getElementById('itemFormTitle').textContent = 'Nuevo Producto';
    document.getElementById('itemName').value = '';
    document.getElementById('itemPrice').value = '';
    document.getElementById('itemCat').value = '';
    document.getElementById('itemImage').value = '';
    document.getElementById('itemDesc').value = '';
    document.getElementById('itemAvail').value = 'SI';
    STATE.editingItemId = null;
    document.getElementById('itemForm').style.display = 'block';
    document.getElementById('itemForm').scrollIntoView({behavior:'smooth'});
  });
  document.getElementById('btnCancelItem').addEventListener('click', () => {
    document.getElementById('itemForm').style.display = 'none';
  });
  document.getElementById('btnSaveItem').addEventListener('click', saveItem);
  document.getElementById('filterCatAdmin').addEventListener('change', e => {
    const cat = e.target.value;
    renderAdminMenuGrid(cat ? STATE.menu.filter(m => m.category === cat) : STATE.menu);
  });

  // Mesas admin
  document.getElementById('btnSaveMesas').addEventListener('click', () => {
    const n = parseInt(document.getElementById('numMesas').value) || 10;
    localStorage.setItem('rp_numMesas', n);
    previewMesas();
    renderMesasGrid();
    showToast(`${n} mesas configuradas`, 'success');
  });
  document.getElementById('numMesas').addEventListener('input', previewMesas);

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // ── SET DATE FILTERS FIRST (before any navigate calls) ──
  document.getElementById('ordersDateFilter').value = today();
  document.getElementById('invDateFilter').value = today();
  document.getElementById('expDate').value = today();

  // ── INIT ──
  loadConfig();
  loadMenu();
  renderMesasGrid();
  renderPOSState();
  startClock();
});
