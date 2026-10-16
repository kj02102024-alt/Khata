# खाता — कपड़ा दुकान का हिसाब-किताब

A mobile-first PWA for tracking sales and payments across two textile shops, built with **Node.js + Express + MongoDB Atlas**.

---

## File Structure

```
khata/
├── server.js              ← Express entry point
├── db.js                  ← MongoDB connection helper
├── package.json
├── .env.example           ← Copy to .env and fill in
├── .gitignore
│
├── models/
│   ├── User.js            ← Shop login (username + hashed PIN)
│   ├── Customer.js        ← Shared customer list (text indexes)
│   └── Entry.js           ← Ledger entries (soft-delete)
│
├── middleware/
│   └── auth.js            ← JWT verification middleware
│
├── routes/
│   ├── auth.js            ← POST /api/auth/login
│   ├── customers.js       ← GET /api/customers/search, /:id/detail, POST /
│   └── entries.js         ← POST /api/entries, /undo · GET /today
│
├── scripts/
│   └── seed.js            ← Create shop1 / shop2 users (run once)
│
└── public/                ← Frontend SPA (served statically)
    ├── index.html         ← App shell
    ├── style.css          ← Mobile-first, high-contrast styles
    ├── strings.js         ← ALL Hindi text strings (edit here)
    ├── app.js             ← Full SPA logic
    ├── sw.js              ← Service Worker (offline shell)
    ├── manifest.json      ← PWA manifest
    └── icons/             ← Put icon-192.png and icon-512.png here
```

---

## Setup (First Time)

### 1. Install dependencies
```bash
npm install
```

### 2. Create `.env`
```bash
cp .env.example .env
```
Then edit `.env`:
- Paste your **MongoDB Atlas connection string**
- Generate a JWT secret: `openssl rand -hex 64`

### 3. Edit PINs in `scripts/seed.js`
Open `scripts/seed.js` and change the PINs in the `USERS` array.

### 4. Create shop users
```bash
node scripts/seed.js
```
This creates `shop1` and `shop2` users in the database.

### 5. Add PWA icons
Place `icon-192.png` and `icon-512.png` in `public/icons/`.
See `public/icons/README.txt` for quick generation instructions.

### 6. Start the server
```bash
npm start
```
Open `http://localhost:3000` in a browser.

---

## Running in Development
```bash
npm run dev      # uses nodemon — auto-restarts on file changes
```

---

## API Reference

All `/api/*` routes (except `/api/auth/login`) require:
```
Authorization: Bearer <token>
```

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login with username + PIN |
| `GET`  | `/api/customers/search?q=` | Live search by name/village |
| `GET`  | `/api/customers/:id` | Customer fields |
| `GET`  | `/api/customers/:id/detail` | Customer + entries + balance |
| `POST` | `/api/customers` | Create customer |
| `POST` | `/api/entries` | Add sale or payment |
| `POST` | `/api/entries/undo` | Soft-delete last entry (this shop) |
| `GET`  | `/api/entries/today` | Today's entries (all shops) |

---

## Security Notes

- PINs are hashed with **bcryptjs** (cost 12) — never stored plain
- JWT tokens expire in **90 days** — so elderly users stay logged in
- Login route is **rate-limited** to 10 attempts per 15 minutes
- **Helmet** sets security headers (CSP, HSTS, etc.)
- Entries use **soft delete only** — data is never physically removed
- All input is validated with **express-validator**

---

## Customising Strings

All user-facing text is in **`public/strings.js`**.
Open that file and change any value — no other file needs to be touched.

---

## PWA Installation

On Android Chrome: tap the browser menu → "Add to Home screen"  
On iOS Safari: tap Share → "Add to Home Screen"

The app shell (HTML/CSS/JS) is cached by the service worker, so it
opens instantly even without internet. API calls always go to the server.
