/**
 * RESTOPOS — Google Apps Script Backend
 * =======================================
 * INSTRUCCIONES DE INSTALACIÓN:
 * 1. Ir a https://script.google.com
 * 2. Crear nuevo proyecto → pegar este código
 * 3. Cambiar SPREADSHEET_ID con el ID de tu Google Sheet
 * 4. Ejecutar setupSheets() una vez para crear las hojas
 * 5. Implementar como Web App:
 *    - Implementar > Nueva implementación
 *    - Tipo: Aplicación web
 *    - Ejecutar como: Yo
 *    - Acceso: Cualquier persona
 * 6. Copiar la URL del Web App en la configuración de RestoPOS
 */

// ============================================================
// CONFIGURACIÓN
// ============================================================
const SPREADSHEET_ID = 'REEMPLAZA_CON_TU_SPREADSHEET_ID';

// Nombres de las hojas
const SHEETS = {
  MENU:     'Menu',
  ORDENES:  'Ordenes',
  GASTOS:   'Gastos',
  CONFIG:   'Config',
};

// ============================================================
// CORS / ENTRY POINTS
// ============================================================
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'RestoPOS API activa', version: '1.0' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const result = handleAction(data);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// ACTION ROUTER
// ============================================================
function handleAction(data) {
  switch (data.action) {
    case 'ping':         return { msg: 'Conexión exitosa con Google Sheets' };
    case 'getMenu':      return getMenu();
    case 'saveMenuItem': return saveMenuItem(data.item);
    case 'deleteMenuItem': return deleteMenuItem(data.id);
    case 'saveOrder':    return saveOrder(data.order);
    case 'getOrders':    return getOrders(data.date, data.period);
    case 'saveExpense':  return saveExpense(data.expense);
    case 'getExpenses':  return getExpenses(data.period);
    case 'getConfig':    return getConfig();
    case 'saveConfig':   return saveConfig(data.config);
    default:             throw new Error('Acción desconocida: ' + data.action);
  }
}

// ============================================================
// MENU FUNCTIONS
// ============================================================
function getMenu() {
  const sheet = getSheet(SHEETS.MENU);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { items: [] };

  const headers = data[0];
  const items = data.slice(1).map((row, i) => {
    const obj = {};
    headers.forEach((h, j) => { obj[h.toLowerCase()] = row[j]; });
    obj.rowIndex = i + 2; // 1-indexed, skip header
    return obj;
  });

  return { items: items.filter(i => i.id) };
}

function saveMenuItem(item) {
  const sheet = getSheet(SHEETS.MENU);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Look for existing row
  const existingRowIdx = data.findIndex((row, i) => i > 0 && String(row[0]) === String(item.id));

  const rowData = [
    item.id, item.name, item.price, item.category, item.image || '', item.desc || '', item.available || 'SI'
  ];

  if (existingRowIdx > 0) {
    // Update existing
    sheet.getRange(existingRowIdx + 1, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // Insert new
    sheet.appendRow(rowData);
  }

  return { ok: true };
}

function deleteMenuItem(id) {
  const sheet = getSheet(SHEETS.MENU);
  const data = sheet.getDataRange().getValues();
  const rowIdx = data.findIndex((row, i) => i > 0 && String(row[0]) === String(id));
  if (rowIdx > 0) sheet.deleteRow(rowIdx + 1);
  return { ok: true };
}

// ============================================================
// ORDER FUNCTIONS
// ============================================================
function saveOrder(order) {
  const sheet = getSheet(SHEETS.ORDENES);
  sheet.appendRow([
    order.id,
    order.mesa,
    order.items,
    order.itemsDetail,
    order.total,
    order.payment,
    order.invoiceType || 'Ninguno',
    order.clientName || '',
    order.clientDoc || '',
    order.date,
    order.time,
    order.status || 'Pagado',
    new Date().toLocaleString('es-PE')
  ]);
  return { ok: true };
}

function getOrders(date, period) {
  const sheet = getSheet(SHEETS.ORDENES);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { orders: [] };

  const headers = data[0];
  let orders = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, j) => { obj[h.toLowerCase().replace(/\s/g,'_')] = row[j]; });
    return obj;
  });

  // Filter
  if (date) {
    orders = orders.filter(o => String(o.fecha || o.date) === date);
  } else if (period) {
    const now = new Date();
    orders = orders.filter(o => {
      const d = new Date(o.fecha || o.date);
      if (period === 'day') return String(o.fecha||o.date) === Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (period === 'year') return d.getFullYear() === now.getFullYear();
      return true;
    });
  }

  return { orders };
}

// ============================================================
// EXPENSE FUNCTIONS
// ============================================================
function saveExpense(expense) {
  const sheet = getSheet(SHEETS.GASTOS);
  sheet.appendRow([
    expense.id,
    expense.category,
    expense.desc,
    expense.amount,
    expense.date,
    new Date().toLocaleString('es-PE')
  ]);
  return { ok: true };
}

function getExpenses(period) {
  const sheet = getSheet(SHEETS.GASTOS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { expenses: [] };

  const headers = data[0];
  let expenses = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, j) => { obj[h.toLowerCase()] = row[j]; });
    return obj;
  });

  if (period) {
    const now = new Date();
    expenses = expenses.filter(e => {
      const d = new Date(e.date || e.fecha);
      if (period === 'day') return String(e.date||e.fecha) === Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (period === 'year') return d.getFullYear() === now.getFullYear();
      return true;
    });
  }

  return { expenses };
}

// ============================================================
// CONFIG
// ============================================================
function getConfig() {
  const sheet = getSheet(SHEETS.CONFIG);
  const data = sheet.getDataRange().getValues();
  const config = {};
  data.forEach(row => {
    if (row[0]) config[row[0]] = row[1];
  });
  return { config };
}

function saveConfig(config) {
  const sheet = getSheet(SHEETS.CONFIG);
  sheet.clearContents();
  Object.entries(config).forEach(([k, v]) => {
    sheet.appendRow([k, v]);
  });
  return { ok: true };
}

// ============================================================
// SETUP (run once)
// ============================================================
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Create sheets if they don't exist
  createSheetIfNotExists(ss, SHEETS.MENU, [
    'id', 'name', 'price', 'category', 'image', 'desc', 'available'
  ]);

  createSheetIfNotExists(ss, SHEETS.ORDENES, [
    'id', 'mesa', 'items', 'itemsDetail', 'total', 'payment', 'invoiceType',
    'clientName', 'clientDoc', 'date', 'time', 'status', 'createdAt'
  ]);

  createSheetIfNotExists(ss, SHEETS.GASTOS, [
    'id', 'category', 'desc', 'amount', 'date', 'createdAt'
  ]);

  createSheetIfNotExists(ss, SHEETS.CONFIG, ['key', 'value']);

  // Add sample menu items
  const menuSheet = ss.getSheetByName(SHEETS.MENU);
  if (menuSheet.getLastRow() <= 1) {
    const sampleItems = [
      ['1', 'Ceviche Mixto', 28, 'Comidas', '', 'Ceviche de mariscos', 'SI'],
      ['2', 'Lomo Saltado', 22, 'Comidas', '', 'Clásico peruano', 'SI'],
      ['3', 'Arroz con Pollo', 20, 'Comidas', '', 'Plato principal', 'SI'],
      ['4', 'Causa Limeña', 14, 'Entradas', '', 'Entrada fría', 'SI'],
      ['5', 'Anticuchos', 16, 'Entradas', '', 'Brocheta de corazón', 'SI'],
      ['6', 'Inca Kola 500ml', 4, 'Bebidas', '', 'Bebida gaseosa', 'SI'],
      ['7', 'Chicha Morada', 5, 'Bebidas', '', 'Bebida tradicional', 'SI'],
      ['8', 'Agua Mineral', 3, 'Bebidas', '', '500ml', 'SI'],
      ['9', 'Arroz con Leche', 6, 'Postres', '', 'Postre tradicional', 'SI'],
      ['10', 'Suspiro Limeño', 7, 'Postres', '', 'Postre clásico', 'SI'],
    ];
    sampleItems.forEach(item => menuSheet.appendRow(item));
  }

  Logger.log('✅ Setup completado. Sheets creadas: ' + Object.values(SHEETS).join(', '));
}

function createSheetIfNotExists(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1e1e1e');
    headerRange.setFontColor('#e8a45a');
    Logger.log('✅ Hoja creada: ' + name);
  }
  return sheet;
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Hoja "${name}" no encontrada. Ejecuta setupSheets() primero.`);
  return sheet;
}
