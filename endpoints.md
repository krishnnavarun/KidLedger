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
- [x] **Transactions** (4 Endpoints)
- [x] **Merchants** (1 Endpoint)
- [x] **Spending Rules** (4 Endpoints)
- [x] **Payments & Approvals** (3 Endpoints)
- [x] **Money Requests** (4 Endpoints)
- [x] **In-App Notifications** (3 Endpoints)

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

## 🛍️ 6. Merchants & Categories (`/api/v1/merchants`)

### `GET /api/v1/merchants`
* **Access:** Public or Authenticated
* **Description:** Lists all seeded simulated merchants (e.g., Steam Games, Subway, Bookstore).
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "merchants": [
        {
          "id": "673m...",
          "name": "Steam Games",
          "category": "gaming",
          "description": "Video games and in-game items"
        },
        {
          "id": "673n...",
          "name": "Subway",
          "category": "fast_food",
          "description": "Sandwiches and meals"
        }
      ]
    }
  }
  ```

---

## 🛡️ 7. Spending Rules (`/api/v1/rules`)

### `POST /api/v1/rules`
* **Access:** `parent` ONLY
* **Headers:** `Authorization: Bearer <parentAccessToken>`
* **Description:** Parent configures spending limits or blocks for a linked child.
* **Body:**
  ```json
  {
    "childId": "673f...",
    "type": "blocked_category",
    "value": "gaming",
    "actionOnViolation": "BLOCK"
  }
  ```
  *(Other supported types: `per_txn_cap`, `daily_limit`, `weekly_limit`, `monthly_limit`, `blocked_merchant`, `allow_only`)*
* **Response `201 Created`:**
  ```json
  {
    "success": true,
    "data": {
      "rule": {
        "id": "673o...",
        "childId": "673f...",
        "type": "blocked_category",
        "value": "gaming",
        "actionOnViolation": "BLOCK",
        "active": true
      }
    }
  }
  ```

### `GET /api/v1/rules?childId=<childId>`
* **Access:** `parent` ONLY
* **Headers:** `Authorization: Bearer <parentAccessToken>`
* **Description:** View all spending rules configured for the given child.

### `PATCH /api/v1/rules/:id`
* **Access:** `parent` ONLY
* **Headers:** `Authorization: Bearer <parentAccessToken>`
* **Body:**
  ```json
  {
    "active": false,
    "value": 15000
  }
  ```

### `DELETE /api/v1/rules/:id`
* **Access:** `parent` ONLY
* **Headers:** `Authorization: Bearer <parentAccessToken>`
* **Description:** Deletes a rule.

---

## 💳 8. Payments & Approvals (`/api/v1/payments` & `/api/v1/transactions`)

### `POST /api/v1/payments`
* **Access:** `child` ONLY
* **Headers:**
  - `Authorization: Bearer <childAccessToken>`
  - `Idempotency-Key: <unique-string>`
* **Body:**
  ```json
  {
    "merchantId": "673n...",
    "amount": 15000,
    "note": "Lunch at Subway"
  }
  ```
* **Outcomes:**
  - **Approved:** `201 Created` $\rightarrow$ `{ "status": "completed", "decision": "APPROVE" }` (wallet debited).
  - **Blocked:** `200 OK` $\rightarrow$ `{ "status": "declined", "decision": "BLOCK", "reason": "..." }` (no money moved).
  - **Needs Approval:** `200 OK` $\rightarrow$ `{ "status": "pending", "decision": "NEEDS_APPROVAL", "reason": "..." }` (waiting for parent).

### `POST /api/v1/payments/peer` (Pay Friend via Mobile Number)
* **Access:** `child` ONLY
* **Headers:**
  - `Authorization`: `Bearer <childAccessToken>`
  - `Idempotency-Key: <unique-string>`
* **Description:** Sends money to a friend's registered child account by mobile number. Enforces the **max ₹300/day (30,000 paise)** guardrail.
* **Body:**
  ```json
  {
    "recipientPhone": "9876543210",
    "amount": 15000,
    "note": "Split pizza bill"
  }
  ```
* **Outcomes:**
  - **Within Limit ($\le$ ₹300/day):** `201 Created` $\rightarrow$ Deducts sender, credits friend, writes 2 ledger entries.
  - **Exceeds Limit (> ₹300/day):** Returns `200 OK` with `status: "declined"` or `status: "pending"` (requires parent approval).

### `POST /api/v1/payments/scan` (Shop QR Code Scanner)
* **Access:** `child` ONLY
* **Headers:**
  - `Authorization`: `Bearer <childAccessToken>`
  - `Idempotency-Key: <unique-string>`
* **Description:** Child scans simulated UPI / KidLedger shop QR codes (e.g. `upi://pay?pa=subway@upi&merchantId=...&am=120.00`).
* **Body:**
  ```json
  {
    "qrCode": "upi://pay?pa=subway@upi&merchantId=673n...&am=120.00"
  }
  ```
* **Response `201 Created`:** Evaluates shop category against rules and executes payment.

### `POST /api/v1/transactions/:id/approve`
* **Access:** `parent` ONLY
* **Headers:** `Authorization: Bearer <parentAccessToken>`
* **Description:** Parent approves a pending transaction. Deducts child wallet balance atomically and writes ledger entry.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "transaction": {
        "id": "673p...",
        "status": "completed"
      },
      "message": "Transaction approved successfully"
    }
  }
  ```

### `POST /api/v1/transactions/:id/decline`
* **Access:** `parent` ONLY
* **Headers:** `Authorization: Bearer <parentAccessToken>`
* **Body (Optional):**
  ```json
  {
    "reason": "You have enough books for now"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "transaction": {
        "id": "673p...",
        "status": "declined"
      },
      "message": "Transaction declined successfully"
    }
  }
  ```

---

## 🙋 9. Money Requests (`/api/v1/requests`)

### `POST /api/v1/requests` (Child Requests Money)
* **Access:** `child` ONLY
* **Headers:** `Authorization: Bearer <childAccessToken>`
* **Description:** Child requests money from their linked parent with an explanation/reason. Automatically notifies the parent.
* **Body:**
  ```json
  {
    "amount": 25000,
    "reason": "School science exhibition supplies"
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "success": true,
    "data": {
      "request": {
        "id": "674a...",
        "childId": "674c...",
        "parentId": "674p...",
        "amount": 25000,
        "reason": "School science exhibition supplies",
        "status": "pending",
        "decidedAt": null,
        "decisionReason": null,
        "transactionId": null,
        "createdAt": "2026-11-20T12:00:00.000Z"
      }
    }
  }
  ```

### `GET /api/v1/requests` (List Money Requests)
* **Access:** `parent` or `child`
* **Headers:** `Authorization: Bearer <token>`
* **Query Params:**
  - `status`: Filter by `pending`, `approved`, or `declined` (optional)
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 20)
* **Description:** Parents view incoming requests from their children; children view their own outgoing requests.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "requests": [
        {
          "id": "674a...",
          "childId": {
            "id": "674c...",
            "name": "John Connor",
            "email": "john@example.com"
          },
          "amount": 25000,
          "reason": "School science exhibition supplies",
          "status": "pending",
          "createdAt": "2026-11-20T12:00:00.000Z"
        }
      ],
      "pagination": {
        "total": 1,
        "page": 1,
        "pages": 1
      }
    }
  }
  ```

### `POST /api/v1/requests/:id/approve` (Parent Approves Request)
* **Access:** `parent` ONLY
* **Headers:**
  - `Authorization`: `Bearer <parentAccessToken>`
  - `Idempotency-Key: <unique-string>` (optional)
* **Description:** Parent approves the request. Executes an atomic ledger transfer from parent wallet to child wallet, updates request status to `approved`, and sends an in-app notification to the child.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "request": {
        "id": "674a...",
        "status": "approved",
        "decidedAt": "2026-11-20T12:05:00.000Z",
        "transactionId": "674t..."
      },
      "transaction": {
        "id": "674t...",
        "type": "transfer",
        "amount": 25000,
        "status": "completed"
      },
      "message": "Money request approved and funds transferred"
    }
  }
  ```

### `POST /api/v1/requests/:id/decline` (Parent Declines Request)
* **Access:** `parent` ONLY
* **Headers:** `Authorization: Bearer <parentAccessToken>`
* **Body (Optional):**
  ```json
  {
    "reason": "Wait until your monthly allowance cycle"
  }
  ```
* **Description:** Parent declines the money request with an optional reason. No money is moved, and the child is notified.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "request": {
        "id": "674a...",
        "status": "declined",
        "decisionReason": "Wait until your monthly allowance cycle",
        "decidedAt": "2026-11-20T12:05:00.000Z"
      },
      "message": "Money request declined"
    }
  }
  ```

---

## 🔔 10. In-App Notifications (`/api/v1/notifications`)

### `GET /api/v1/notifications` (List Notifications)
* **Access:** Authenticated (`parent` or `child`)
* **Headers:** `Authorization: Bearer <token>`
* **Query Params:**
  - `unreadOnly`: `true` or `false` (default: false)
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 20)
* **Description:** Retrieves paginated notifications and total unread count for the authenticated user.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "notifications": [
        {
          "id": "674n...",
          "type": "money_request",
          "title": "New Money Request",
          "message": "John Connor requested ₹250.00 for: \"School science exhibition supplies\"",
          "metadata": {
            "requestId": "674a...",
            "childName": "John Connor",
            "amount": 25000
          },
          "readAt": null,
          "createdAt": "2026-11-20T12:00:00.000Z"
        }
      ],
      "unreadCount": 1,
      "pagination": {
        "total": 1,
        "page": 1,
        "pages": 1
      }
    }
  }
  ```

### `PATCH /api/v1/notifications/:id/read` (Mark Notification as Read)
* **Access:** Authenticated
* **Headers:** `Authorization: Bearer <token>`
* **Description:** Marks a single notification as read (`readAt` timestamp set).
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "notification": {
        "id": "674n...",
        "readAt": "2026-11-20T12:10:00.000Z"
      }
    }
  }
  ```

### `PATCH /api/v1/notifications/read-all` (Mark All as Read)
* **Access:** Authenticated
* **Headers:** `Authorization: Bearer <token>`
* **Description:** Marks all unread notifications for the user as read.
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "message": "All notifications marked as read",
      "modifiedCount": 3
    }
  }
  ```


