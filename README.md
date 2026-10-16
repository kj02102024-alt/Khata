# खाता — कपड़ा दुकान का हिसाब-किताब

A mobile-first PWA for tracking sales and payments across two textile shops, built with **Node.js + Express + MongoDB Atlas**.

---

## 🌟 Enhanced Features

1. **Payment Settlement & FIFO Sales Reconciliation**
   - **"💰 पैसे मिले"** settlement button on every customer page.
   - **"पूरा चुकता"**: One-tap full balance payoff.
   - **"कुछ पैसे मिले"**: Touch-friendly large on-screen number pad for partial payments.
   - **Confirmation Card**: Displays `<name> ने ₹X दिए. बाकी ₹Y` (or advance `अग्रिम`) before saving.
   - **Dynamic FIFO Sales Matching**: Oldest sales are settled first without ever modifying or deleting sale entries.
   - **Collapsible Settled Section**: Paid sales move into `चुकता हिसाब` with strikethrough & faded styling.
   - **Undo Payment & Daily Collections**: Undo latest payment (soft-delete only) and view **"आज का पैसा"** grouped by shop.

2. **Role-Based Access Control (Admin vs. Shopkeeper UI)**
   - **User Roles**: `admin` and `shopkeeper`.
   - **Shopkeeper Mode (Simple View)**: Minimal, high-contrast, large touch targets, 100% Hindi Devanagari labels.
   - **Admin Mode (Pro View)**: Full cross-shop reporting, complete transaction & soft-delete audit log with **restore ↺** overrides, and **CSV / JSON data export**.

3. **Senior Accessibility (Voice & Camera)**
   - **Voice Input (Web Speech API)**: Large `🎤 बोलकर भरें` button on search and entry forms converts spoken Hindi into form fields.
   - **Photo Receipt Attachment**: Camera button `📷 पर्ची / फोटो लें` captures receipt photos, compresses them via HTML5 Canvas, and stores visual proof with entries.

---

## File Structure

```
khata/
├── server.js              ← Express entry point (10MB body parser, CSP)
├── db.js                  ← MongoDB connection helper
├── package.json           ← Dependencies & Node engines (>=20)
├── .env.example           ← Environment secrets template
├── .gitignore
│
├── models/
│   ├── User.js            ← Users with role ("admin" | "shopkeeper")
│   ├── Customer.js        ← Shared customers (text index on name + village)
│   └── Entry.js           ← Ledger entries with soft-delete and photo support
│
├── middleware/
│   └── auth.js            ← JWT guard (`requireAuth`) & Admin guard (`requireAdmin`)
│
├── routes/
│   ├── auth.js            ← Login (returns token, shop, role, displayName)
│   ├── customers.js       ← Search with dues filter & Detail with FIFO reconciliation
│   ├── entries.js         ← Entry creation with photo, undo, undo-payment, today-payments
│   └── admin.js           ← Overview metrics, audit log, restore-entry, CSV/JSON export
│
├── scripts/
│   └── seed.js            ← Seeds shop1, shop2, and admin users
│
└── public/                ← Frontend SPA (served statically)
    ├── index.html         ← App shell with Photo modal and Admin nav
    ├── style.css          ← High-contrast styles, number pad, voice pulse, collapsible sections
    ├── strings.js         ← ALL Hindi text strings (single source of truth)
    ├── app.js             ← SPA router, settlement, FIFO display, voice & camera logic
    ├── sw.js              ← Service Worker (offline shell caching)
    ├── manifest.json      ← PWA install metadata
    └── icons/             ← PWA icons
```

---

## API Reference

All protected routes require:
```
Authorization: Bearer <token>
```

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Public | Login with username + PIN |
| `GET`  | `/api/customers/search?q=&pendingOnly=` | Auth | Live search with dues filter |
| `GET`  | `/api/customers/:id/detail` | Auth | Customer + FIFO reconciled sales + balance |
| `POST` | `/api/customers` | Auth | Create new customer |
| `POST` | `/api/entries` | Auth | Add sale or payment (with photo) |
| `POST` | `/api/entries/undo` | Auth | Soft-delete last entry |
| `POST` | `/api/entries/undo-payment` | Auth | Soft-delete last payment |
| `GET`  | `/api/entries/today` | Auth | Today's entries |
| `GET`  | `/api/entries/today-payments` | Auth | Today's collections grouped by shop |
| `GET`  | `/api/admin/overview` | Admin | Cross-shop sales, collections & balance KPI |
| `GET`  | `/api/admin/audit-log` | Admin | Full audit log including soft-deleted entries |
| `POST` | `/api/admin/restore-entry/:id` | Admin | Restore a soft-deleted entry |
| `GET`  | `/api/admin/export?format=csv` | Admin | Export all ledger data as CSV / JSON |

---

## Default Accounts (Seed Script)

Run `node scripts/seed.js` to initialize:

| Username | Default PIN | Role | Shop |
|----------|-------------|------|------|
| `shop1`  | `123456`    | `shopkeeper` | Shop 1 |
| `shop2`  | `654321`    | `shopkeeper` | Shop 2 |
| `admin`  | `999999`    | `admin`      | Shop 1 |
