# 🍽 RestoPOS — Sistema de Ventas para Restaurante

Sistema completo de punto de venta con Google Sheets como base de datos, deployable como página web en GitHub Pages o como app APK (WebView).

---

## 📁 Archivos del proyecto

```
restaurant-system/
├── index.html      → Interfaz principal del sistema
├── styles.css      → Estilos (tema oscuro/cálido)
├── app.js          → Lógica frontend (POS, Dashboard, Gastos, etc.)
├── Code.gs         → Backend Google Apps Script
└── README.md       → Este archivo
```

---

## 🚀 PASO 1: Configurar Google Sheets

### 1.1 Crear la planilla

1. Ve a [sheets.google.com](https://sheets.google.com)
2. Crea una nueva hoja de cálculo
3. Copia el **ID** de la URL:  
   `https://docs.google.com/spreadsheets/d/**ID_AQUÍ**/edit`

---

## 🚀 PASO 2: Configurar Google Apps Script

### 2.1 Crear el proyecto

1. Ve a [script.google.com](https://script.google.com)
2. **Nuevo proyecto**
3. Borra el código de ejemplo
4. Pega todo el contenido de `Code.gs`
5. En la línea: `const SPREADSHEET_ID = 'REEMPLAZA_CON_TU_SPREADSHEET_ID';`  
   → Reemplaza con el ID copiado en el paso 1

### 2.2 Ejecutar el setup inicial

1. Selecciona la función `setupSheets` en el menú desplegable
2. Haz clic en **▶ Ejecutar**
3. Acepta los permisos de Google
4. Verifica que se crearon las hojas: `Menu`, `Ordenes`, `Gastos`, `Config`

### 2.3 Publicar como Web App

1. Click en **Implementar** → **Nueva implementación**
2. Selecciona tipo: **Aplicación web**
3. Configurar:
   - **Descripción**: RestoPOS v1.0
   - **Ejecutar como**: Yo
   - **Acceso**: Cualquier persona (incluso usuarios anónimos)
4. Click **Implementar**
5. **COPIA la URL del Web App** (la necesitarás)

> ⚠️ Cada vez que modifiques el código `.gs`, debes crear una **nueva implementación** (no actualizar la existente) para que los cambios surtan efecto.

---

## 🚀 PASO 3: Configurar RestoPOS

### 3.1 En la interfaz web:

1. Abre `index.html` en el navegador
2. Ve a **⚙️ Administración** → pestaña **Configuración**
3. Pega la URL del Web App en el campo correspondiente
4. Completa: Nombre del negocio, RUC, Dirección
5. Click **Guardar Configuración**
6. Click **Probar Conexión** — debe aparecer "✅ Conexión exitosa"

---

## 🌐 PASO 4: Publicar en GitHub Pages

### 4.1 Subir a GitHub

```bash
git init
git add .
git commit -m "RestoPOS v1.0"
git remote add origin https://github.com/TU_USUARIO/restopos.git
git push -u origin main
```

### 4.2 Activar GitHub Pages

1. Ve a tu repositorio en GitHub
2. **Settings** → **Pages**
3. Source: **Deploy from a branch**
4. Branch: `main` / `/ (root)`
5. Save

Tu sistema estará disponible en:  
`https://TU_USUARIO.github.io/restopos/`

---

## 📱 PASO 5: Crear APK para Android

Puedes convertir el sistema en una app APK usando una WebView simple:

### Opción A: MIT App Inventor (más fácil)

1. Ve a [appinventor.mit.edu](http://appinventor.mit.edu)
2. Crea un nuevo proyecto
3. Agrega un componente **WebViewer**
4. En las propiedades, ingresa la URL de GitHub Pages
5. Genera el APK

### Opción B: Android Studio (más control)

```xml
<!-- activity_main.xml -->
<WebView
    android:id="@+id/webview"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />
```

```kotlin
// MainActivity.kt
val webView = findViewById<WebView>(R.id.webview)
webView.settings.javaScriptEnabled = true
webView.settings.domStorageEnabled = true  // Para localStorage
webView.loadUrl("https://TU_USUARIO.github.io/restopos/")
```

---

## 🗂 Estructura de Google Sheets

### Hoja: Menu
| id | name | price | category | image | desc | available |
|---|---|---|---|---|---|---|
| 1 | Ceviche Mixto | 28 | Comidas | (url) | Descripción | SI |

### Hoja: Ordenes
| id | mesa | items | itemsDetail | total | payment | invoiceType | clientName | clientDoc | date | time | status | createdAt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

### Hoja: Gastos
| id | category | desc | amount | date | createdAt |
|---|---|---|---|---|---|

### Hoja: Config
| key | value |
|---|---|

---

## 💡 Funcionalidades

### Punto de Venta (POS)
- ✅ Selección de mesa
- ✅ Menú por categorías con pestañas
- ✅ Imágenes descriptivas de productos
- ✅ Agregar/quitar items con control de cantidad
- ✅ Cálculo automático de totales

### Cobro
- ✅ Pago en Efectivo (calcula vuelto)
- ✅ Yape, Plin, Tarjeta
- ✅ Emisión de Boleta o Factura
- ✅ Datos del cliente para comprobante

### Órdenes
- ✅ Historial filtrado por fecha
- ✅ Resumen por método de pago
- ✅ Ver comprobante de cada orden

### Dashboard
- ✅ KPIs: Ventas, Gastos, Ganancia Neta, Productividad
- ✅ Ticket promedio y cantidad de órdenes
- ✅ Gráfico de métodos de pago
- ✅ Gráfico de productos más vendidos
- ✅ Gráfico Ventas vs Gastos
- ✅ Filtro: Hoy / Este Mes / Este Año

### Gastos
- ✅ Categorías: Empleados, Electricidad, Agua, Internet, Insumos, Combustible, Alquiler, Otros
- ✅ Registro por fecha

### Facturas y Boletas
- ✅ Listado de todos los comprobantes
- ✅ Visualizar e imprimir

### Administración
- ✅ Gestión completa del menú (CRUD)
- ✅ Imágenes por producto
- ✅ Control de disponibilidad
- ✅ Configuración de mesas
- ✅ Configuración del negocio

---

## 📊 Índice de Productividad

El sistema calcula el **Índice de Productividad** con la fórmula:

```
IP = (Ganancia / Gastos Totales) × 100%
```

Ejemplo:
- Ventas: S/ 5,000
- Gastos: S/ 2,000
- Ganancia: S/ 3,000
- **IP = 150%** (por cada sol de gasto, se genera S/ 1.50 de ganancia)

---

## 🔧 Modo Demo (sin conexión)

Si no configuras la URL del Web App, el sistema funciona en **modo demo** con:
- Menú de ejemplo con 10 productos peruanos
- Órdenes y gastos guardados en `localStorage` del navegador
- Dashboard funcional con datos locales

---

## 📞 Soporte

Para modificaciones o errores, revisa:
1. La consola del navegador (F12 → Console)
2. Los logs de Apps Script: **Ver → Registros de ejecución**
3. Que el Web App tenga permiso "Cualquier persona"

---

*RestoPOS — Desarrollado para restaurantes peruanos 🇵🇪*
