# KidLedger Wallet — API Endpoints Reference (`endpoints.md`)

This living document tracks all API endpoints in **KidLedger Wallet**, including required roles, headers, sample request payloads, and response structures for testing in Postman or frontend integration.

> 💡 **Money Convention:** All monetary amounts are integers in **paise** (1 INR = 100 paise).  
> Example: ₹100.00 is represented as `10000`, ₹500.00 is `50000`.

---

## 🧭 Status Overview

- [x] **System & Health** (2 Endpoints)
- [x] **Authentication** (5 Endpoints)
- [x] **Family & Child Accounts** (2 Endpoints)
- [x] **Wallets & Ledger** (5 Endpoints)
- [x] **Transactions** (2 Endpoints)
- [ ] **Merchants** (1 Endpoint — In Progress)
- [ ] **Spending Rules** (4 Endpoints — In Progress)
- [ ] **Payments & Approvals** (3 Endpoints — In Progress)

---

## 🌐 1. System & Health

### `GET /`
* **Access:** Public
* **Description:** API root index and navigation links.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Welcome to KidLedger Wallet API",
    "version": "v1",
    "health": "/api/v1/health",
    "endpoints": { ... }
  }
  ```

### `GET /api/v1/health`
* **Access:** Public
* **Description:** Health check reporting uptime and MongoDB connection state.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "status": "healthy",
      "app": "KidLedger Wallet API",
      "timestamp": "2026-11-20T10:20:00.000Z",
      "uptime": 120.45,
      "database": "connected"
    }
  }
  ```

---

## 🔐 2. Authentication (`/api/v1/auth`)

### `POST /api/v1/auth/register`
* **Access:** Public
* **Description:** Self-registration for parents. Automatically creates a Parent Wallet with 0 balance.
* **Body:**
  ```json
  {
    "name": "Sarah Connor",
    "email": "sarah@example.com",
    "password": "Password123!"
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "673e...",
        "name": "Sarah Connor",
        "email": "sarah@example.com",
        "role": "parent"
      },
      "accessToken": "eyJhbGci..."
    }
  }
  ```
* **Cookies Set:** `kidledger_refresh` (httpOnly, 7 days)

### `POST /api/v1/auth/login`
* **Access:** Public (Parent or Child)
* **Description:** Login with email and password.
* **Body:**
  ```json
  {
    "email": "sarah@example.com",
    "password": "Password123!"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "673e...",
        "name": "Sarah Connor",
        "email": "sarah@example.com",
        "role": "parent"
      },
      "accessToken": "eyJhbGci..."
    }
  }
  ```

### `POST /api/v1/auth/refresh`
* **Access:** Public (Reads `kidledger_refresh` cookie)
* **Description:** Issues a new 15-minute access token.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "user": { ... },
      "accessToken": "eyJhbGci..."
    }
  }
  ```

### `POST /api/v1/auth/logout`
* **Access:** Public
* **Description:** Clears the refresh token cookie.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "message": "Logged out successfully"
    }
  }
  ```

### `GET /api/v1/auth/me`
* **Access:** Authenticated (`parent` or `child`)
* **Headers:** `Authorization: Bearer <accessToken>`
* **Description:** Returns the authenticated user's profile.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "673e...",
        "name": "Sarah Connor",
        "email": "sarah@example.com",
        "role": "parent"
      }
    }
  }
  ```

---

## 👨‍👩‍👧 3. Family & Child Management (`/api/v1/family`)

### `POST /api/v1/family/children`
* **Access:** `parent` ONLY
* **Headers:** `Authorization: Bearer <parentAccessToken>`
* **Description:** Parent creates an account for a child/dependent (no age restrictions; DOB is optional) and initializes their wallet.
* **Body:**
  ```json
  {
    "name": "John Connor",
    "email": "john.connor@example.com",
    "password": "ChildPassword123!",
    "dateOfBirth": "2006-12-05"
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "success": true,
    "data": {
      "child": {
        "id": "673f...",
        "name": "John Connor",
        "email": "john.connor@example.com",
        "role": "child",
        "dateOfBirth": "2014-05-15T00:00:00.000Z"
      },
      "familyLink": {
        "id": "673g...",
        "parentId": "673e...",
        "childId": "673f...",
        "status": "active",
        "consentGivenAt": "2026-11-20T10:25:00.000Z"
      }
    }
  }
  ```

### `GET /api/v1/family/children`
* **Access:** `parent` ONLY
* **Headers:** `Authorization: Bearer <parentAccessToken>`
* **Description:** Returns list of all linked children for the parent.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "children": [
        {
          "id": "673f...",
          "name": "John Connor",
          "email": "john.connor@example.com",
          "dateOfBirth": "2014-05-15T00:00:00.000Z",
          "role": "child",
          "linkedAt": "2026-11-20T10:25:00.000Z"
        }
      ]
    }
  }
  ```

---

## 💰 4. Wallets & Ledger (`/api/v1/wallets`)

### `GET /api/v1/wallets/me`
* **Access:** Authenticated (`parent` or `child`)
* **Headers:** `Authorization: Bearer <accessToken>`
* **Description:** Returns the logged-in user's wallet and 10 most recent ledger entries.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "wallet": {
        "id": "673h...",
        "ownerId": "673e...",
        "type": "parent",
        "balance": 100000,
        "currency": "INR"
      },
      "recentLedger": [
        {
          "id": "673i...",
          "direction": "credit",
          "amount": 100000,
          "balanceAfter": 100000,
          "createdAt": "2026-11-20T10:30:00.000Z"
        }
      ]
    }
  }
  ```

### `GET /api/v1/wallets/:childId`
* **Access:** `parent` ONLY
* **Headers:** `Authorization: Bearer <parentAccessToken>`
* **Description:** Parent views the wallet of a verified linked child.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "wallet": {
        "id": "673j...",
        "ownerId": "673f...",
        "type": "child",
        "balance": 30000,
        "currency": "INR"
      },
      "recentLedger": [ ... ]
    }
  }
  ```

### `POST /api/v1/wallets/topup`
* **Access:** `parent` ONLY
* **Headers:**
  - `Authorization: Bearer <parentAccessToken>`
  - `Idempotency-Key: <unique-string>`
* **Description:** Adds test funds to parent's wallet. Duplicate requests return cached transaction without double-charging.
* **Body:**
  ```json
  {
    "amount": 100000
  }
  ```
* **Response `201 Created` (or `200 OK` on duplicate retry):**
  ```json
  {
    "success": true,
    "data": {
      "transaction": {
        "id": "673k...",
        "type": "topup",
        "amount": 100000,
        "status": "completed",
        "idempotencyKey": "topup-test-001"
      },
      "isDuplicate": false
    }
  }
  ```

### `POST /api/v1/wallets/transfer`
* **Access:** `parent` ONLY
* **Headers:**
  - `Authorization: Bearer <parentAccessToken>`
  - `Idempotency-Key: <unique-string>`
* **Description:** Transfers funds atomically from parent wallet to child wallet.
* **Body:**
  ```json
  {
    "childId": "673f...",
    "amount": 30000
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "success": true,
    "data": {
      "transaction": {
        "id": "673l...",
        "type": "transfer",
        "fromWalletId": "673h...",
        "toWalletId": "673j...",
        "amount": 30000,
        "status": "completed",
        "idempotencyKey": "transfer-test-001"
      },
      "isDuplicate": false
    }
  }
  ```

### `GET /api/v1/wallets/:walletId/reconcile`
* **Access:** Authenticated
* **Headers:** `Authorization: Bearer <accessToken>`
* **Description:** Audit check verifying $\text{Stored Balance} = \sum \text{Credits} - \sum \text{Debits}$.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "walletId": "673h...",
      "storedBalance": 70000,
      "reconciledBalance": 70000,
      "isConsistent": true,
      "entryCount": 2
    }
  }
  ```

---

## 📜 5. Transactions (`/api/v1/transactions`)

### `GET /api/v1/transactions`
* **Access:** Authenticated (`parent` or `child`)
* **Headers:** `Authorization: Bearer <accessToken>`
* **Query Params:** `?page=1&limit=20&status=completed&category=allowance`
* **Description:** Lists user's transaction history with pagination and filters.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "transactions": [ ... ],
      "pagination": {
        "total": 5,
        "page": 1,
        "pages": 1
      }
    }
  }
  ```

### `GET /api/v1/transactions/:id`
* **Access:** Authenticated
* **Headers:** `Authorization: Bearer <accessToken>`
* **Description:** Fetches single transaction details.

---

## 🛍️ 6. Merchants & Spending Controls (Phase 4 — Upcoming)

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/api/v1/merchants` | Public / Auth | List seeded merchants and categories |
| `POST` | `/api/v1/rules` | `parent` ONLY | Create spending rule for child |
| `GET` | `/api/v1/rules?childId=...` | `parent` ONLY | View child's active spending rules |
| `PATCH` | `/api/v1/rules/:id` | `parent` ONLY | Toggle/update rule (active/value) |
| `DELETE` | `/api/v1/rules/:id` | `parent` ONLY | Deactivate spending rule |
| `POST` | `/api/v1/payments` | `child` ONLY | Child pays simulated merchant |
| `POST` | `/api/v1/transactions/:id/approve` | `parent` ONLY | Parent approves pending transaction |
| `POST` | `/api/v1/transactions/:id/decline` | `parent` ONLY | Parent declines pending transaction |
