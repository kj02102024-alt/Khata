# Khata · खाता

Production-oriented mobile-first PWA for textile shop ledgers with a dual-role architecture:

1. **Shopkeeper Mode** — Devanagari Hindi, huge touch targets, voice-first entry, customer dues (“बचा”), diary photo upload.
2. **Pro Admin Portal** — Bilingual English 🌐 Hindi SaaS dashboard, metrics, split-screen diary review, FIFO settlement, audit trail.

## Stack

- Node.js · Express · Mongoose (MongoDB Atlas or local)
- Multer image uploads
- Vanilla JS SPA · Web Speech API · PWA (manifest + service worker)

## Setup

```bash
cp .env.example .env
# Optional: set MONGODB_URI to MongoDB Atlas (recommended for persistence).
# If unset / unreachable in development, an in-memory MongoDB is used and auto-seeded.
npm install
npm run reset-data   # purge + seed shop1 / shop2 / admin (needs MONGODB_URI or memory)
npm start            # http://localhost:3000
```


### Default logins (after reset)

| Username | Password  | Role        |
|----------|-----------|-------------|
| `shop1`  | `khata123`| Shopkeeper  |
| `shop2`  | `khata123`| Shopkeeper  |
| `admin`  | `khata123`| Admin       |

## Voice notes

Speech recognition needs **Chrome/Edge** (or Safari with limited support) over **HTTPS** or `localhost`. The engine keeps the mic open through long pauses (≈8s silence buffer) and offers a **पूर्ण** button to finish manually.
