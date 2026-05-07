/**
 * RESTOPOS — app.js
 * Sistema de Ventas para Restaurante
 * Backend: Google Apps Script + Google Sheets
 */

// ============================================================
// CONFIG & STATE
// ============================================================
const CFG = {
  scriptUrl: localStorage.getItem('rp_scriptUrl') || '',
  businessName: localStorage.getItem('rp_businessName') || 'Mi Restaurante',
  businessRuc: localStorage.getItem('rp_businessRuc') || '',
  businessAddress: localStorage.getItem('rp_businessAddress') || '',
  numMesas: parseInt(localStorage.getItem('rp_numMesas') || '10'),
};

const STATE = {
  menu: [],
  categories: [],
  currentMesa: '',
  currentOrder: [],   // { id, name, price, qty }
  orders: [],
  expenses: [],
  invoices: [],
  selectedPayment: 'Efectivo',
  charts: {},
  editingItemId: null,
};

// ============================================================
// GOOGLE SHEETS API CALLS
// ============================================================
async function api(action, payload = {}) {
  if (!CFG.scriptUrl) {
    throw new Error('URL del Web App no configurada. Ve a Administración > Configuración.');
  }
  const url = CFG.scriptUrl;
  const body = JSON.stringify({ action, ...payload });
  const res = await fetch(url, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'text/plain' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

// Demo / offline fallback (used when no script URL is configured)
function getDemoMenu() {
  return [
    { id:'1', name:'Arroz con Leche', price:6, category:'Postres', image:'', desc:'Postre tradicional', available:'SI' },
    { id:'2', name:'Ceviche Mixto', price:28, category:'Comidas', image:'', desc:'Ceviche de mariscos', available:'SI' },
    { id:'3', name:'Lomo Saltado', price:22, category:'Comidas', image:'', desc:'Clásico peruano', available:'SI' },
    { id:'4', name:'Inca Kola 500ml', price:4, category:'Bebidas', image:'', desc:'Bebida gaseosa', available:'SI' },
    { id:'5', name:'Chicha Morada', price:5, category:'Bebidas', image:'', desc:'Bebida tradicional', available:'SI' },
    { id:'6', name:'Causa Limeña', price:14, category:'Entradas', image:'', desc:'Entrada fría', available:'SI' },
    { id:'7', name:'Anticuchos', price:16, category:'Entradas', image:'', desc:'Brocheta de corazón', available:'SI' },
    { id:'8', name:'Suspiro Limeño', price:7, category:'Postres', image:'', desc:'Postre clásico', available:'SI' },
    { id:'9', name:'Agua Mineral', price:3, category:'Bebidas', image:'', desc:'500ml', available:'SI' },
    { id:'10', name:'Arroz con Pollo', price:20, category:'Comidas', image:'', desc:'Plato principal', available:'SI' },
  ];
}

// ============================================================
// UTILS
// ============================================================
function fmt(n) {
  return 'S/ ' + parseFloat(n || 0).toFixed(2);
}
function today() {
  return new Date().toISOString().split('T')[0];
}
function now() {
  return new Date().toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
}
function nowFull() {
  return new Date().toLocaleString('es-PE');
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,5);
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

function setConnectionStatus(state) {
  const dot = document.querySelector('.status-dot');
  const txt = document.querySelector('.status-text');
  if (state === 'ok') { dot.className = 'status-dot connected'; txt.textContent = 'Conectado'; }
  else if (state === 'err') { dot.className = 'status-dot error'; txt.textContent = 'Sin conexión'; }
  else { dot.className = 'status-dot'; txt.textContent = 'Conectando...'; }
}

// ============================================================
// NAVIGATION
// ============================================================
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  const titles = {
    pos: 'Punto de Venta', orders: 'Órdenes', dashboard: 'Dashboard',
    expenses: 'Gastos', invoices: 'Facturas y Boletas', admin: 'Administración'
  };
  document.getElementById('pageTitle').textContent = titles[page] || '';
  // Load data for page
  if (page === 'orders') loadOrders();
  if (page === 'dashboard') loadDashboard();
  if (page === 'expenses') loadExpenses();
  if (page === 'invoices') loadInvoices();
  if (page === 'admin') loadAdminMenu();
  // Close sidebar on mobile
  if (window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open');
}

// ============================================================
// DATE/TIME CLOCK
// ============================================================
function startClock() {
  const el = document.getElementById('dateTime');
  function tick() {
    const d = new Date();
    el.textContent = d.toLocaleDateString('es-PE', { weekday:'short', day:'2-digit', month:'short' })
      + ' · ' + d.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
  }
  tick();
  setInterval(tick, 10000);
}

// ============================================================
// MESAS
// ============================================================
function buildMesaOptions() {
  const sel = document.getElementById('mesaSelect');
  sel.innerHTML = '<option value="">— Seleccionar Mesa —</option>';
  for (let i = 1; i <= CFG.numMesas; i++) {
    sel.innerHTML += `<option value="Mesa ${i}">Mesa ${i}</option>`;
  }
}

function previewMesas() {
  const n = parseInt(document.getElementById('numMesas').value) || 10;
  const container = document.getElementById('mesasPreview');
  container.innerHTML = '';
  for (let i = 1; i <= n; i++) {
    container.innerHTML += `<div class="mesa-chip">Mesa ${i}</div>`;
  }
}

// ============================================================
// MENU LOADING
// ============================================================
async function loadMenu() {
  document.getElementById('itemsGrid').innerHTML = '<div class="loading-items">Cargando menú...</div>';
  try {
    let items;
    if (CFG.scriptUrl) {
      const res = await api('getMenu');
      items = res.items || [];
    } else {
      items = getDemoMenu();
    }
    STATE.menu = items;
    buildCategoryTabs(items);
    renderMenuItems(items);
    setConnectionStatus('ok');
  } catch (e) {
    STATE.menu = getDemoMenu();
    buildCategoryTabs(STATE.menu);
    renderMenuItems(STATE.menu);
    setConnectionStatus('err');
    showToast('Usando datos demo (sin conexión)', 'info');
  }
}

function buildCategoryTabs(items) {
  const cats = ['Todos', ...new Set(items.map(i => i.category).filter(Boolean))];
  STATE.categories = cats;
  const tabs = document.getElementById('catTabs');
  tabs.innerHTML = '';
  cats.forEach((c, idx) => {
    const btn = document.createElement('button');
    btn.className = 'cat-tab' + (idx === 0 ? ' active' : '');
    btn.dataset.cat = c;
    btn.textContent = c;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const filtered = c === 'Todos' ? STATE.menu : STATE.menu.filter(m => m.category === c);
      renderMenuItems(filtered);
    });
    tabs.appendChild(btn);
  });
}

function renderMenuItems(items) {
  const grid = document.getElementById('itemsGrid');
  const available = items.filter(i => i.available !== 'NO');
  if (!available.length) {
    grid.innerHTML = '<div class="loading-items">No hay productos disponibles</div>';
    return;
  }
  const emojis = { Comidas:'🍽', Bebidas:'🥤', Postres:'🍮', Entradas:'🥗', Otros:'⭐' };
  grid.innerHTML = available.map(item => `
    <div class="item-card ${item.available==='NO'?'unavailable':''}" data-id="${item.id}" onclick="addToOrder('${item.id}')">
      <div class="item-img">
        ${item.image ? `<img src="${item.image}" alt="${item.name}" onerror="this.parentElement.innerHTML='${emojis[item.category]||'🍽'}'">` : (emojis[item.category]||'🍽')}
      </div>
      <span class="item-cat-badge">${item.category||''}</span>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-price">${fmt(item.price)}</div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// ORDER MANAGEMENT
// ============================================================
function addToOrder(itemId) {
  if (!STATE.currentMesa) {
    showToast('Selecciona una mesa primero', 'error');
    document.getElementById('mesaSelect').focus();
    return;
  }
  const item = STATE.menu.find(m => m.id == itemId);
  if (!item) return;
  const existing = STATE.currentOrder.find(o => o.id == itemId);
  if (existing) { existing.qty++; }
  else { STATE.currentOrder.push({ id: item.id, name: item.name, price: parseFloat(item.price), qty: 1 }); }
  renderOrderPanel();
}

function renderOrderPanel() {
  const container = document.getElementById('orderItems');
  if (!STATE.currentOrder.length) {
    container.innerHTML = `<div class="order-empty"><span>🛒</span><p>Agrega productos del menú</p></div>`;
    updateTotals();
    return;
  }
  container.innerHTML = STATE.currentOrder.map(item => `
    <div class="order-item-row">
      <div class="order-item-name">${item.name}</div>
      <div class="order-item-qty">
        <button class="qty-btn" onclick="changeQty('${item.id}', -1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
      </div>
      <div class="order-item-price">${fmt(item.price * item.qty)}</div>
      <button class="order-item-del" onclick="removeItem('${item.id}')" title="Eliminar">✕</button>
    </div>
  `).join('');
  updateTotals();
}

function changeQty(id, delta) {
  const item = STATE.currentOrder.find(o => o.id == id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) STATE.currentOrder = STATE.currentOrder.filter(o => o.id != id);
  renderOrderPanel();
}

function removeItem(id) {
  STATE.currentOrder = STATE.currentOrder.filter(o => o.id != id);
  renderOrderPanel();
}

function updateTotals() {
  const sub = STATE.currentOrder.reduce((s, o) => s + o.price * o.qty, 0);
  document.getElementById('subtotal').textContent = fmt(sub);
  document.getElementById('totalFinal').textContent = fmt(sub);
  document.getElementById('checkoutTotal').textContent = fmt(sub);
}

function clearOrder() {
  STATE.currentOrder = [];
  renderOrderPanel();
}

// ============================================================
// CHECKOUT
// ============================================================
function openCheckoutModal() {
  if (!STATE.currentMesa) { showToast('Selecciona una mesa', 'error'); return; }
  if (!STATE.currentOrder.length) { showToast('La orden está vacía', 'error'); return; }

  // Build summary
  const sum = document.getElementById('checkoutSummary');
  sum.innerHTML = STATE.currentOrder.map(o =>
    `<div class="checkout-summary-row"><span>${o.qty}x ${o.name}</span><span>${fmt(o.price*o.qty)}</span></div>`
  ).join('');

  const total = STATE.currentOrder.reduce((s, o) => s + o.price * o.qty, 0);
  document.getElementById('checkoutTotal').textContent = fmt(total);
  document.getElementById('cashReceived').value = '';
  document.getElementById('changeDisplay').textContent = 'Vuelto: S/ 0.00';

  document.getElementById('checkoutModal').classList.add('open');
}

function confirmCheckout() {
  const total = STATE.currentOrder.reduce((s, o) => s + o.price * o.qty, 0);
  const method = STATE.selectedPayment;
  const invoiceType = document.getElementById('invoiceType').value;
  const clientName = document.getElementById('clientName').value;
  const clientDoc = document.getElementById('clientDoc').value;

  const order = {
    id: genId(),
    mesa: STATE.currentMesa,
    items: STATE.currentOrder.map(o => `${o.qty}x ${o.name} (${fmt(o.price*o.qty)})`).join(', '),
    itemsDetail: JSON.stringify(STATE.currentOrder),
    total,
    payment: method,
    invoiceType,
    clientName,
    clientDoc,
    date: today(),
    time: now(),
    status: 'Pagado',
  };

  saveOrder(order);
}

async function saveOrder(order) {
  const btn = document.getElementById('confirmCheckout');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    if (CFG.scriptUrl) {
      await api('saveOrder', { order });
    } else {
      // Demo mode: save locally
      const local = JSON.parse(localStorage.getItem('rp_orders') || '[]');
      local.push(order);
      localStorage.setItem('rp_orders', JSON.stringify(local));
    }
    showToast('¡Orden guardada exitosamente!', 'success');
    document.getElementById('checkoutModal').classList.remove('open');
    showReceipt(order);
    clearOrder();
    STATE.currentMesa = '';
    document.getElementById('mesaSelect').value = '';
    document.getElementById('orderTableBadge').textContent = 'Sin mesa';
  } catch (e) {
    showToast('Error al guardar: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ Confirmar Pago';
  }
}

// ============================================================
// RECEIPT
// ============================================================
function showReceipt(order) {
  const lines = JSON.parse(order.itemsDetail || '[]');
  const itemLines = lines.map(o =>
    `${(o.qty+'x').padEnd(3)} ${o.name.substring(0,20).padEnd(20)} ${fmt(o.price*o.qty).padStart(9)}`
  ).join('\n');

  const dash = '─'.repeat(40);
  const title = CFG.businessName.toUpperCase();
  const type = order.invoiceType !== 'Ninguno' ? order.invoiceType.toUpperCase() : 'TICKET DE CONSUMO';

  let clientSection = '';
  if (order.invoiceType !== 'Ninguno' && order.clientName) {
    clientSection = `\nCliente: ${order.clientName}\nDoc:     ${order.clientDoc}\n`;
  }

  const receipt = `
${title.padStart(Math.floor((40+title.length)/2))}
${CFG.businessAddress || ''}
RUC: ${CFG.businessRuc || '—'}
${dash}
          ${type}
${dash}
Mesa: ${order.mesa}           ${order.date} ${order.time}
${dash}
CANT DESCRIPCIÓN              IMPORTE
${dash}
${itemLines}
${dash}
                    TOTAL: ${fmt(order.total).padStart(9)}
${dash}
Pago: ${order.payment}
${order.invoiceType === 'Ninguno' ? '' : clientSection}
  ¡Gracias por su visita!
${dash}
`.trim();

  document.getElementById('receiptContent').textContent = receipt;
  document.getElementById('receiptModal').classList.add('open');

  // Save invoice record
  saveInvoiceRecord(order, receipt);
}

function saveInvoiceRecord(order, text) {
  const inv = JSON.parse(localStorage.getItem('rp_invoices') || '[]');
  inv.push({
    id: order.id,
    type: order.invoiceType,
    client: order.clientName || '—',
    total: order.total,
    date: order.date,
    receipt: text
  });
  localStorage.setItem('rp_invoices', JSON.stringify(inv));
}

// ============================================================
// ORDERS PAGE
// ============================================================
async function loadOrders() {
  const tbody = document.getElementById('ordersTbody');
  tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Cargando...</td></tr>';
  try {
    let orders;
    const dateFilter = document.getElementById('ordersDateFilter').value || today();
    if (CFG.scriptUrl) {
      const res = await api('getOrders', { date: dateFilter });
      orders = res.orders || [];
    } else {
      const local = JSON.parse(localStorage.getItem('rp_orders') || '[]');
      orders = local.filter(o => !dateFilter || o.date === dateFilter);
    }
    STATE.orders = orders;
    renderOrdersTable(orders);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('ordersTbody');
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-row">No hay órdenes para esta fecha</td></tr>';
    document.getElementById('ordersSummary').innerHTML = '';
    return;
  }

  tbody.innerHTML = orders.map((o, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${o.mesa}</td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.items}</td>
      <td><strong style="color:var(--accent)">${fmt(o.total)}</strong></td>
      <td>${o.payment}</td>
      <td>${o.time||''}</td>
      <td><span class="badge badge-paid">${o.status||'Pagado'}</span></td>
      <td><button class="link-btn" onclick="viewOrderReceipt('${o.id}')">🧾 Ver</button></td>
    </tr>
  `).join('');

  // Summary
  const totalVentas = orders.reduce((s, o) => s + parseFloat(o.total||0), 0);
  const byMethod = {};
  orders.forEach(o => { byMethod[o.payment] = (byMethod[o.payment]||0) + parseFloat(o.total||0); });

  const summary = document.getElementById('ordersSummary');
  summary.innerHTML = `
    <div class="summary-chip">📋 Órdenes: <strong>${orders.length}</strong></div>
    <div class="summary-chip">💵 Total: <strong>${fmt(totalVentas)}</strong></div>
    ${Object.entries(byMethod).map(([k,v]) => `<div class="summary-chip">${k}: <strong>${fmt(v)}</strong></div>`).join('')}
  `;
}

function viewOrderReceipt(id) {
  const invs = JSON.parse(localStorage.getItem('rp_invoices') || '[]');
  const inv = invs.find(i => i.id == id);
  if (inv) {
    document.getElementById('receiptContent').textContent = inv.receipt;
    document.getElementById('receiptModal').classList.add('open');
  } else {
    showToast('Comprobante no disponible', 'info');
  }
}

// ============================================================
// EXPENSES PAGE
// ============================================================
async function loadExpenses() {
  const tbody = document.getElementById('expensesTbody');
  tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Cargando...</td></tr>';
  try {
    let expenses;
    if (CFG.scriptUrl) {
      const res = await api('getExpenses');
      expenses = res.expenses || [];
    } else {
      expenses = JSON.parse(localStorage.getItem('rp_expenses') || '[]');
    }
    STATE.expenses = expenses;
    renderExpensesTable(expenses);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

function renderExpensesTable(expenses) {
  const tbody = document.getElementById('expensesTbody');
  if (!expenses.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="loading-row">No hay gastos registrados</td></tr>';
    return;
  }
  tbody.innerHTML = expenses.map(e => `
    <tr>
      <td>${e.date}</td>
      <td><span class="badge badge-pending">${e.category}</span></td>
      <td>${e.desc}</td>
      <td><strong style="color:var(--red)">${fmt(e.amount)}</strong></td>
    </tr>
  `).join('');
}

async function saveExpense() {
  const cat = document.getElementById('expCat').value;
  const desc = document.getElementById('expDesc').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const date = document.getElementById('expDate').value;

  if (!desc || !amount || !date) { showToast('Completa todos los campos', 'error'); return; }

  const expense = { id: genId(), category: cat, desc, amount, date };

  try {
    if (CFG.scriptUrl) {
      await api('saveExpense', { expense });
    } else {
      const local = JSON.parse(localStorage.getItem('rp_expenses') || '[]');
      local.push(expense);
      localStorage.setItem('rp_expenses', JSON.stringify(local));
    }
    showToast('Gasto registrado', 'success');
    document.getElementById('expenseForm').style.display = 'none';
    loadExpenses();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ============================================================
// INVOICES PAGE
// ============================================================
function loadInvoices() {
  const filter = document.getElementById('invDateFilter').value;
  let invs = JSON.parse(localStorage.getItem('rp_invoices') || '[]');
  if (filter) invs = invs.filter(i => i.date === filter);

  const tbody = document.getElementById('invoicesTbody');
  if (!invs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No hay comprobantes</td></tr>';
    return;
  }
  tbody.innerHTML = invs.map((inv, i) => `
    <tr>
      <td>${i+1}</td>
      <td><span class="badge ${inv.type==='Factura'?'badge-pending':'badge-paid'}">${inv.type||'Ticket'}</span></td>
      <td>${inv.client||'—'}</td>
      <td>${fmt(inv.total)}</td>
      <td>${inv.date||''}</td>
      <td>
        <button class="link-btn" onclick="showStoredReceipt('${inv.id}')">🧾 Ver</button>
        <button class="link-btn" onclick="printStoredReceipt('${inv.id}')" style="margin-left:8px">🖨</button>
      </td>
    </tr>
  `).join('');
}

function showStoredReceipt(id) {
  const invs = JSON.parse(localStorage.getItem('rp_invoices') || '[]');
  const inv = invs.find(i => i.id == id);
  if (!inv) { showToast('No encontrado', 'error'); return; }
  document.getElementById('receiptContent').textContent = inv.receipt;
  document.getElementById('receiptModal').classList.add('open');
}

function printStoredReceipt(id) {
  showStoredReceipt(id);
  setTimeout(() => window.print(), 500);
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  const period = document.getElementById('dashPeriod').value;
  document.getElementById('kpiVentas').textContent = 'Cargando...';

  try {
    let orders, expenses;

    if (CFG.scriptUrl) {
      const [oRes, eRes] = await Promise.all([
        api('getOrders', { period }),
        api('getExpenses', { period })
      ]);
      orders = oRes.orders || [];
      expenses = eRes.expenses || [];
    } else {
      orders = JSON.parse(localStorage.getItem('rp_orders') || '[]');
      expenses = JSON.parse(localStorage.getItem('rp_expenses') || '[]');

      // Filter by period
      const now2 = new Date();
      orders = orders.filter(o => {
        if (!o.date) return false;
        const d = new Date(o.date);
        if (period === 'day') return o.date === today();
        if (period === 'month') return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear();
        if (period === 'year') return d.getFullYear() === now2.getFullYear();
        return true;
      });
      expenses = expenses.filter(e => {
        if (!e.date) return false;
        const d = new Date(e.date);
        if (period === 'day') return e.date === today();
        if (period === 'month') return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear();
        if (period === 'year') return d.getFullYear() === now2.getFullYear();
        return true;
      });
    }

    const totalVentas = orders.reduce((s, o) => s + parseFloat(o.total||0), 0);
    const totalGastos = expenses.reduce((s, e) => s + parseFloat(e.amount||0), 0);
    const ganancia = totalVentas - totalGastos;
    const productividad = totalGastos > 0 ? ((ganancia / totalGastos) * 100).toFixed(1) : '∞';
    const ticketProm = orders.length > 0 ? totalVentas / orders.length : 0;

    document.getElementById('kpiVentas').textContent = fmt(totalVentas);
    document.getElementById('kpiGastos').textContent = fmt(totalGastos);
    document.getElementById('kpiGanancia').textContent = fmt(ganancia);
    document.getElementById('kpiProductividad').textContent = productividad + '%';
    document.getElementById('kpiOrdenes').textContent = orders.length;
    document.getElementById('kpiTicketProm').textContent = fmt(ticketProm);

    buildCharts(orders, expenses, totalVentas, totalGastos);

  } catch (e) {
    showToast('Error al cargar dashboard: ' + e.message, 'error');
  }
}

function buildCharts(orders, expenses, totalVentas, totalGastos) {
  // Destroy existing charts
  Object.values(STATE.charts).forEach(c => c?.destroy());

  const chartDefaults = {
    plugins: { legend: { labels: { color: '#a09a92', font: { size: 11 } } } },
    scales: {}
  };

  // Chart 1: Payment methods
  const payMethods = {};
  orders.forEach(o => { payMethods[o.payment] = (payMethods[o.payment]||0) + parseFloat(o.total||0); });
  const ctx1 = document.getElementById('chartPago');
  if (ctx1) {
    STATE.charts.pago = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: Object.keys(payMethods),
        datasets: [{ data: Object.values(payMethods), backgroundColor: ['#e8a45a','#9b72e8','#4caf7d','#5b8dee'] }]
      },
      options: { ...chartDefaults, plugins: { legend: { labels: { color: '#a09a92' } } } }
    });
  }

  // Chart 2: Top products
  const prodCount = {};
  orders.forEach(o => {
    try {
      const items = JSON.parse(o.itemsDetail || '[]');
      items.forEach(i => { prodCount[i.name] = (prodCount[i.name]||0) + i.qty; });
    } catch {}
  });
  const sorted = Object.entries(prodCount).sort((a,b) => b[1]-a[1]).slice(0,6);
  const ctx2 = document.getElementById('chartProductos');
  if (ctx2) {
    STATE.charts.productos = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: sorted.map(s => s[0]),
        datasets: [{ label: 'Vendidos', data: sorted.map(s => s[1]), backgroundColor: '#e8a45a88', borderColor: '#e8a45a', borderWidth: 2 }]
      },
      options: {
        ...chartDefaults,
        scales: { x: { ticks: { color: '#a09a92', font: { size: 10 } }, grid: { color: '#2a2a2a' } }, y: { ticks: { color: '#a09a92' }, grid: { color: '#2a2a2a' } } }
      }
    });
  }

  // Chart 3: Ventas vs Gastos (by category)
  const expCats = {};
  expenses.forEach(e => { expCats[e.category] = (expCats[e.category]||0) + parseFloat(e.amount||0); });
  const ctx3 = document.getElementById('chartVentasGastos');
  if (ctx3) {
    STATE.charts.vg = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: ['Ventas Totales', 'Gastos Totales', 'Ganancia', ...Object.keys(expCats)],
        datasets: [{
          label: 'S/',
          data: [totalVentas, totalGastos, totalVentas-totalGastos, ...Object.values(expCats)],
          backgroundColor: [
            '#4caf7d88', '#e0555588', '#e8a45a88',
            ...Object.keys(expCats).map(() => '#5b8dee44')
          ],
          borderColor: ['#4caf7d', '#e05555', '#e8a45a', ...Object.keys(expCats).map(() => '#5b8dee')],
          borderWidth: 2,
        }]
      },
      options: {
        ...chartDefaults,
        scales: { x: { ticks: { color: '#a09a92' }, grid: { color: '#2a2a2a' } }, y: { ticks: { color: '#a09a92', callback: v => 'S/'+v }, grid: { color: '#2a2a2a' } } }
      }
    });
  }
}

// ============================================================
// ADMIN — MENU MANAGEMENT
// ============================================================
async function loadAdminMenu() {
  document.getElementById('menuAdminGrid').innerHTML = '<div class="loading-items">Cargando...</div>';
  try {
    let items;
    if (CFG.scriptUrl) {
      const res = await api('getMenu');
      items = res.items || [];
    } else {
      items = STATE.menu.length ? STATE.menu : getDemoMenu();
    }
    STATE.menu = items;
    renderAdminMenuGrid(items);

    // Populate filter
    const cats = [...new Set(items.map(i => i.category).filter(Boolean))];
    const sel = document.getElementById('filterCatAdmin');
    sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c => `<option>${c}</option>`).join('');
  } catch (e) {
    document.getElementById('menuAdminGrid').innerHTML = `<div class="loading-items">Error: ${e.message}</div>`;
  }
}

function renderAdminMenuGrid(items) {
  const grid = document.getElementById('menuAdminGrid');
  const emojis = { Comidas:'🍽', Bebidas:'🥤', Postres:'🍮', Entradas:'🥗', Otros:'⭐' };
  if (!items.length) { grid.innerHTML = '<div class="loading-items">No hay productos</div>'; return; }
  grid.innerHTML = items.map(item => `
    <div class="menu-admin-card">
      <div class="item-img">
        ${item.image ? `<img src="${item.image}" alt="${item.name}" onerror="this.parentElement.innerHTML='${emojis[item.category]||'🍽'}'">` : (emojis[item.category]||'🍽')}
      </div>
      <div class="menu-admin-info">
        <div class="menu-admin-name">${item.name}</div>
        <div class="menu-admin-price">${fmt(item.price)}</div>
        <div class="menu-admin-cat">${item.category} · ${item.available==='NO'?'❌ No disponible':'✅ Disponible'}</div>
      </div>
      <div class="menu-admin-actions">
        <button class="btn-edit" onclick="editItem('${item.id}')">✏️ Editar</button>
        <button class="btn-del" onclick="deleteItem('${item.id}')">🗑</button>
      </div>
    </div>
  `).join('');
}

function showItemForm(item = null) {
  const form = document.getElementById('itemForm');
  document.getElementById('itemFormTitle').textContent = item ? 'Editar Producto' : 'Nuevo Producto';
  document.getElementById('itemName').value = item?.name || '';
  document.getElementById('itemPrice').value = item?.price || '';
  document.getElementById('itemCat').value = item?.category || '';
  document.getElementById('itemImage').value = item?.image || '';
  document.getElementById('itemDesc').value = item?.desc || '';
  document.getElementById('itemAvail').value = item?.available || 'SI';
  STATE.editingItemId = item?.id || null;
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth' });
}

function editItem(id) {
  const item = STATE.menu.find(m => m.id == id);
  if (item) showItemForm(item);
}

async function deleteItem(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  try {
    if (CFG.scriptUrl) {
      await api('deleteMenuItem', { id });
    } else {
      STATE.menu = STATE.menu.filter(m => m.id != id);
      localStorage.setItem('rp_menu_demo', JSON.stringify(STATE.menu));
    }
    showToast('Producto eliminado', 'success');
    loadAdminMenu();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
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
    if (CFG.scriptUrl) {
      await api('saveMenuItem', { item });
    } else {
      if (STATE.editingItemId) {
        const idx = STATE.menu.findIndex(m => m.id == STATE.editingItemId);
        if (idx >= 0) STATE.menu[idx] = item;
      } else {
        STATE.menu.push(item);
      }
    }
    showToast(STATE.editingItemId ? 'Producto actualizado' : 'Producto agregado', 'success');
    document.getElementById('itemForm').style.display = 'none';
    loadAdminMenu();
    loadMenu(); // Refresh POS menu too
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ============================================================
// CONFIG
// ============================================================
function loadConfig() {
  document.getElementById('scriptUrl').value = CFG.scriptUrl;
  document.getElementById('businessName').value = CFG.businessName;
  document.getElementById('businessRuc').value = CFG.businessRuc;
  document.getElementById('businessAddress').value = CFG.businessAddress;
  document.getElementById('numMesas').value = CFG.numMesas;
  previewMesas();
}

function saveConfig() {
  CFG.scriptUrl = document.getElementById('scriptUrl').value.trim();
  CFG.businessName = document.getElementById('businessName').value.trim();
  CFG.businessRuc = document.getElementById('businessRuc').value.trim();
  CFG.businessAddress = document.getElementById('businessAddress').value.trim();
  localStorage.setItem('rp_scriptUrl', CFG.scriptUrl);
  localStorage.setItem('rp_businessName', CFG.businessName);
  localStorage.setItem('rp_businessRuc', CFG.businessRuc);
  localStorage.setItem('rp_businessAddress', CFG.businessAddress);
  showToast('Configuración guardada', 'success');
}

async function testConnection() {
  if (!CFG.scriptUrl) { showToast('Ingresa la URL del Web App', 'error'); return; }
  try {
    const res = await api('ping');
    showToast('✅ Conexión exitosa: ' + (res.msg || 'OK'), 'success');
    setConnectionStatus('ok');
  } catch (e) {
    showToast('❌ Error de conexión: ' + e.message, 'error');
    setConnectionStatus('err');
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigate(item.dataset.page);
    });
  });

  // Menu toggle (mobile)
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Mesa select
  document.getElementById('mesaSelect').addEventListener('change', e => {
    STATE.currentMesa = e.target.value;
    document.getElementById('orderTableBadge').textContent = e.target.value || 'Sin mesa';
    if (!e.target.value) { clearOrder(); }
  });

  // New order button
  document.getElementById('btnNewOrder').addEventListener('click', () => {
    if (!STATE.currentMesa) { showToast('Selecciona una mesa primero', 'error'); return; }
    clearOrder();
    showToast(`Nueva orden para ${STATE.currentMesa}`, 'info');
  });

  // Clear order
  document.getElementById('btnClearOrder').addEventListener('click', () => {
    if (STATE.currentOrder.length && confirm('¿Limpiar la orden?')) clearOrder();
  });

  // Checkout
  document.getElementById('btnCheckout').addEventListener('click', openCheckoutModal);
  document.getElementById('closeCheckout').addEventListener('click', () =>
    document.getElementById('checkoutModal').classList.remove('open'));
  document.getElementById('cancelCheckout').addEventListener('click', () =>
    document.getElementById('checkoutModal').classList.remove('open'));
  document.getElementById('confirmCheckout').addEventListener('click', confirmCheckout);

  // Payment methods
  document.querySelectorAll('.pay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.selectedPayment = btn.dataset.method;
      document.getElementById('cashChangeGroup').style.display =
        btn.dataset.method === 'Efectivo' ? 'block' : 'none';
    });
  });

  // Cash change calculator
  document.getElementById('cashReceived').addEventListener('input', e => {
    const received = parseFloat(e.target.value) || 0;
    const total = STATE.currentOrder.reduce((s, o) => s + o.price * o.qty, 0);
    const change = received - total;
    document.getElementById('changeDisplay').textContent =
      `Vuelto: ${fmt(Math.max(0, change))}`;
    document.getElementById('changeDisplay').style.color =
      change >= 0 ? 'var(--green)' : 'var(--red)';
  });

  // Invoice type toggle
  document.getElementById('invoiceType').addEventListener('change', e => {
    document.getElementById('invoiceClientData').style.display =
      e.target.value !== 'Ninguno' ? 'block' : 'none';
  });

  // Receipt modal
  document.getElementById('closeReceipt').addEventListener('click', () =>
    document.getElementById('receiptModal').classList.remove('open'));
  document.getElementById('btnCloseReceipt').addEventListener('click', () =>
    document.getElementById('receiptModal').classList.remove('open'));
  document.getElementById('btnPrintReceipt').addEventListener('click', () => window.print());

  // Orders filter
  document.getElementById('ordersDateFilter').value = today();
  document.getElementById('btnFilterOrders').addEventListener('click', loadOrders);

  // Dashboard
  document.getElementById('btnDashLoad').addEventListener('click', loadDashboard);

  // Expenses
  document.getElementById('btnAddExpense').addEventListener('click', () => {
    document.getElementById('expenseForm').style.display = 'block';
    document.getElementById('expDate').value = today();
  });
  document.getElementById('btnCancelExpense').addEventListener('click', () => {
    document.getElementById('expenseForm').style.display = 'none';
  });
  document.getElementById('btnSaveExpense').addEventListener('click', saveExpense);

  // Invoices filter
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
  document.getElementById('btnAddItem').addEventListener('click', () => showItemForm());
  document.getElementById('btnCancelItem').addEventListener('click', () => {
    document.getElementById('itemForm').style.display = 'none';
  });
  document.getElementById('btnSaveItem').addEventListener('click', saveItem);

  // Filter admin menu by category
  document.getElementById('filterCatAdmin').addEventListener('change', e => {
    const cat = e.target.value;
    const filtered = cat ? STATE.menu.filter(m => m.category === cat) : STATE.menu;
    renderAdminMenuGrid(filtered);
  });

  // Mesas
  document.getElementById('btnSaveMesas').addEventListener('click', () => {
    CFG.numMesas = parseInt(document.getElementById('numMesas').value) || 10;
    localStorage.setItem('rp_numMesas', CFG.numMesas);
    buildMesaOptions();
    previewMesas();
    showToast(`${CFG.numMesas} mesas configuradas`, 'success');
  });
  document.getElementById('numMesas').addEventListener('input', previewMesas);

  // INIT
  loadConfig();
  buildMesaOptions();
  loadMenu();
  startClock();

  // Set today in date inputs
  document.getElementById('invDateFilter').value = today();
});
