# KidLedger Wallet

> **Parent-Child Money Control App (MERN)**  
> A closed-loop simulated fintech wallet enabling parents to fund wallets for minors, enforce rule-based spending controls, and review immutable ledger movements.

---

## 📌 Overview

KidLedger gives parents full visibility and real-time governance over their children's spending habits. Parents can set dynamic rules (per-transaction caps, category blocks, daily/weekly budgets), while children learn financial discipline within safe guardrails.

> **Note on Payment Rails:** This project uses a simulated closed-loop wallet architecture. It does not connect to real banking rails (RBI/KYC out-of-scope for student demonstration). Simulated payment rails are implemented behind a swappable `PaymentProvider` interface.

---

## 🛠️ Tech Stack

- **Backend:** Node.js (ES Modules, JavaScript), Express.js
- **Database:** MongoDB (Local MongoDB Community Server or MongoDB Atlas Cloud, Mongoose ODM)
- **Validation & Security:** Zod, Helmet, CORS, Cookie-Parser, Bcrypt, JWT (Access + Refresh tokens)
- **Testing:** Vitest, Supertest, MongoMemoryServer (replica set in-memory)
- **Frontend (Upcoming):** React (Vite), Tailwind CSS

---

## 🏗️ Architecture & Core Concepts

1. **Integer Arithmetic**: All money values are strictly stored as integers in **paise** (1 INR = 100 paise) to eliminate floating-point drift.
2. **ACID Financial Safety**: Money movement (parent debit $\rightarrow$ child credit) is managed through atomic ledger operations to guarantee no double-spend or fund loss.
3. **Immutable Append-Only Ledger**: Balances are verified against unalterable audit ledger entries.
4. **Pure Rule Engine**: Deterministic logic determines whether a transaction is `APPROVED`, `BLOCKED`, or `NEEDS_APPROVAL`.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v20+)
- MongoDB installed locally OR a free MongoDB Atlas connection URI

### 1. Configure Environment
Create or edit `server/.env`:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/kidledger
JWT_SECRET=super_secure_kidledger_dev_access_secret_12345
JWT_REFRESH_SECRET=super_secure_kidledger_dev_refresh_secret_67890
```

### 2. Run the Backend Server
```bash
cd server
npm install
npm run dev
```

### 3. Run Automated Tests
No database setup needed for tests—an isolated in-memory replica set spins up automatically:
```bash
cd server
npm test
```
