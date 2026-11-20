# KidLedger Wallet — Development & Learning Guide (`development.md`)

This living document tracks the phase-by-phase implementation of **KidLedger Wallet**, explaining core concepts, design trade-offs, architecture decisions, and system flow diagrams for interview preparation and codebase comprehension.

---

## 🗺️ Roadmap & Phase Tracker

- [x] **Phase 1: Foundation, Infrastructure & Error Handling**
- [x] **Phase 2: Authentication, Role-Based Access Control & Family Linking**
- [x] **Phase 3: Wallets, Append-Only Ledger & Idempotent Transfers**
- [ ] **Phase 4: Simulated Merchants, Rule Engine & Approval Workflow**
- [ ] **Phase 5: Money Requests & In-App Notifications**
- [ ] **Phase 6: Frontend Development (React + Tailwind)**
- [ ] **Phase 7: Step-by-Step Docker Containerization & Deployment**
- [ ] **Phase 8 (v2): Subscriptions, Savings Goals & LLM Spending Insights**

---

## 🏛️ Phase 1: Foundation, Infrastructure & Error Handling

### 1. Key Engineering Concepts & Interview Talking Points

1. **Currency as Integer Paise (No Floats)**
   - *Why:* IEEE 754 floating-point arithmetic causes precision loss (e.g., `0.1 + 0.2 === 0.30000000000000004`). In fintech applications, fractions of a cent accumulate drift, corrupt balance reconciliations, and fail audits.
   - *Implementation:* All monetary calculations and database models strictly use 64-bit integer paise (1 INR = 100 paise).
2. **MongoDB Replica Set for ACID Transactions**
   - *Why:* Moving money between accounts requires an atomic debit on one wallet and credit on another, plus two audit log records. If a power cut or crash occurs midway, no money can be created or lost.
   - *Implementation:* Multi-document ACID transactions in MongoDB are only supported on **replica sets**. Configured Docker Compose locally with a single-node replica set (`rs0`) to mirror production MongoDB Atlas.
3. **Decoupled Express Factory (`createApp()`)**
   - *Why:* Separating Express middleware configuration from the server listening socket allows integration tests (Vitest + Supertest) to test API endpoints in-memory without consuming system ports.
4. **Fail-Fast Environment Validation (Zod)**
   - *Why:* Silently falling back to defaults or running with missing secrets (`JWT_SECRET`, `MONGODB_URI`) causes subtle runtime crashes in production. Zod parses and validates `process.env` on boot, failing instantly with human-readable error messages if any config is invalid.

### 2. Request Flow Architecture

```mermaid
flowchart TD
    Client(["HTTP Client / Frontend"]) --> Helmet["Helmet\n(Security Headers)"]
    Helmet --> CORS["CORS Middleware\n(Origin & Cookie Check)"]
    CORS --> Parser["Body & Cookie Parsers\n(express.json, cookie-parser)"]
    Parser --> Logger["Request Logger\n(Method, URL, Latency)"]
    
    Logger --> Router{"Route Match?"}
    
    Router -- "Yes: /api/v1/health" --> HealthCtrl["Health Controller\n(Checks DB State & Uptime)"]
    HealthCtrl --> ResponseOK["200 OK Response\n{ success: true, data: {...} }"]
    
    Router -- "No / Unknown Route" --> NotFound["notFoundHandler\n(Generates AppError 404)"]
    NotFound --> ErrHandler["Global errorHandler\n(Formats JSON Error Envelope)"]
    ErrHandler --> ResponseErr["Error Response\n{ success: false, error: {...} }"]
```

---

## 🔐 Phase 2: Authentication, Role-Based Access Control & Family Linking

### 1. Key Concepts & Security Architecture

1. **Dual Token Strategy (Short-lived Access + httpOnly Refresh Token)**
   - **Access Token:** Short-lived (15 minutes), signed JWT containing user claims (`sub`, `email`, `role`). Transmitted via `Authorization: Bearer <token>` header. If intercepted, the exposure window is minimal.
   - **Refresh Token:** Long-lived (7 days), stored inside an `httpOnly`, `SameSite=Lax` cookie. JavaScript running in the browser cannot read this cookie, providing strong protection against Cross-Site Scripting (XSS) token theft.
2. **Parent-Child Hierarchical Roles & Consent**
   - Minors (under 18) cannot legally consent or create unparented financial accounts.
   - Children do not self-register: **the parent creates the child's account**, recording parental consent timestamped in the `FamilyLink` model.
   - Child accounts are strictly forbidden from modifying spending rules, changing budget limits, or approving transactions.
3. **Password Security**
   - Passwords are salted and hashed using `bcryptjs` with a work factor of 10 rounds before storing in MongoDB.
   - The `passwordHash` field is configured with `select: false` on the Mongoose model so queries never leak hashes into JSON responses by accident.

### 2. Authentication & Child Linking Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Parent as Parent (User)
    actor Child as Child (Minor)
    participant API as Express API
    participant DB as MongoDB

    Note over Parent, API: 1. Parent Self-Registration & Login
    Parent->>API: POST /api/v1/auth/register { name, email, password }
    API->>DB: Check email uniqueness & save User (role: 'parent')
    API-->>Parent: 201 Created (Access Token + Set-Cookie refresh token)

    Parent->>API: POST /api/v1/auth/login { email, password }
    API->>DB: Verify bcrypt password hash
    API-->>Parent: 200 OK (New Access Token + Set-Cookie refresh token)

    Note over Parent, DB: 2. Parent Creates & Links Child Account
    Parent->>API: POST /api/v1/family/children { name, email, password, dateOfBirth }<br/>(Header: Bearer AccessToken)
    API->>API: Verify role === 'parent'
    API->>DB: Create User (role: 'child', dateOfBirth)
    API->>DB: Create FamilyLink (parentId, childId, consentGivenAt: now)
    API-->>Parent: 201 Created { child, familyLinkId }

    Note over Child, API: 3. Child Logs In With Created Credentials
    Child->>API: POST /api/v1/auth/login { childEmail, childPassword }
    API->>DB: Verify password & fetch role ('child')
    API-->>Child: 200 OK (Child Access Token with role: 'child')
```

### 3. Tested & Verified Endpoints

- `POST /api/v1/auth/register`: Parent self-registration with bcrypt password hashing.
- `POST /api/v1/auth/login`: Issues 15-min JWT access token and sets 7-day `httpOnly` cookie.
- `POST /api/v1/auth/refresh`: Seamless session renewal via cookie.
- `POST /api/v1/auth/logout`: Clears the refresh token cookie.
- `GET /api/v1/auth/me`: Authenticated endpoint returning user profile.
- `POST /api/v1/family/children`: Parent creates a minor's account with verified consent and age restrictions (<18).
- `GET /api/v1/family/children`: Parent fetches all linked children.
- **RBAC Protection:** Child accounts attempting parent routes (e.g. creating children) are rejected with `403 FORBIDDEN`.

---

## 💰 Phase 3: Wallets, Append-Only Ledger & Idempotent Transfers

### 1. Key Engineering Concepts & Interview Talking Points

1. **The Single Point of Balance Mutation (`LedgerService`)**
   - *Architecture Rule:* No controller or route can directly modify `Wallet.balance`. All money additions, transfers, or debits must be executed through `LedgerService`.
   - *Why:* Enforces separation of concerns and prevents developer errors from altering wallet balances without writing the corresponding audit records.
2. **Append-Only Immutable Ledger (`LedgerEntry`)**
   - *Why:* Financial regulations and audits demand a non-repudiable log of every debit and credit. In our Mongoose schema, all mutation hooks (`updateOne`, `deleteMany`, etc.) are actively blocked with errors.
   - *Verification:* The `reconcileWallet(walletId)` utility calculates $\sum \text{Credits} - \sum \text{Debits}$ across all historical entries and asserts it matches the cached `Wallet.balance`.
3. **Idempotency via `Idempotency-Key`**
   - *Why:* Mobile/web clients may experience network timeouts and retry requests. Without idempotency, a retry would double-charge the parent.
   - *Implementation:* Every financial route checks `idempotencyKey` before starting a session. If a record already exists, it returns the cached transaction without moving funds a second time.
4. **MongoDB Multi-Document ACID Transactions**
   - *Why:* Transferring money between two wallets requires 4 simultaneous database writes: debit parent, credit child, append parent ledger entry, append child ledger entry. If any step fails (e.g., negative balance check or server crash), MongoDB aborts the entire transaction session, leaving no partial state.

### 2. Transactional Transfer Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Parent as Parent Client
    participant API as Express API
    participant LS as LedgerService
    participant DB as MongoDB (Replica Set)

    Parent->>API: POST /api/v1/wallets/transfer { childId, amount: 30000 }<br/>(Header: Idempotency-Key: "tx-uuid-123")
    API->>API: Validate Auth & Positive Integer Paise
    API->>LS: transferParentToChild(parentId, childId, 30000, key)

    LS->>DB: Check Transaction.findOne({ idempotencyKey: "tx-uuid-123" })
    alt Key already exists (Duplicate Request)
        DB-->>LS: Existing Transaction Record
        LS-->>API: Return Cached Result (isDuplicate: true)
        API-->>Parent: 200 OK { transaction, isDuplicate: true }
    else New Request (Proceed with ACID Transaction)
        LS->>DB: Start Transaction Session (session.startTransaction)
        LS->>DB: Fetch ParentWallet & ChildWallet (in session)
        alt Parent Balance < Amount
            LS->>DB: Abort Transaction Session
            LS-->>API: Throw AppError 400 (INSUFFICIENT_FUNDS)
            API-->>Parent: 400 Bad Request
        else Parent Balance >= Amount
            LS->>DB: parentWallet.balance -= 30000
            LS->>DB: childWallet.balance += 30000
            LS->>DB: Create Transaction (status: 'completed', key)
            LS->>DB: Create 2x LedgerEntry (Debit Parent, Credit Child)
            LS->>DB: Commit Transaction Session
            LS-->>API: Return Completed Transaction (isDuplicate: false)
            API-->>Parent: 201 Created { transaction, isDuplicate: false }
        end
    end
```

### 3. Tested & Verified Features

- Auto-initialization of parent wallet on registration and child wallet upon parental creation.
- Simulated parent top-up with positive integer paise validation.
- Duplicate idempotency key protection preventing double credits.
- Atomic parent-to-child transfers with debit/credit balance mutation.
- Insufficient funds safety checks preventing negative balances.
- Real-time reconciliation audit proving balance equals sum of ledger entries.
- Immutable schema guard preventing ledger tampering or deletion.

---

## 🛡️ Phase 4: Simulated Merchants, Rule Engine & Approval Workflow (Next Up)

### Planned Scope:
1. **Merchant Model (`src/models/Merchant.js`)**: Seeded merchant directory with categories (e.g., `gaming`, `fast_food`, `books`, `entertainment`, `groceries`).
2. **Rule Model (`src/models/Rule.js`)**:
   - Limits: `daily_limit`, `weekly_limit`, `monthly_limit`, `per_txn_cap`.
   - Controls: `blocked_category`, `blocked_merchant`, `allow_only`.
3. **Pure Rule Engine (`src/rules/ruleEngine.js`)**:
   - Pure, deterministic function: `evaluateRules({ transaction, rules, historicalSpend }) => { decision, reason }`.
   - Returns `APPROVE`, `BLOCK`, or `NEEDS_APPROVAL`.
4. **Child Payment Execution & Parent Approval Flow**:
   - `POST /api/v1/payments`: Child pays merchant; engine decides outcome.
   - If `NEEDS_APPROVAL`: Marked as `pending`. Parent can approve (`POST /api/v1/transactions/:id/approve`) or decline (`POST /api/v1/transactions/:id/decline`).



---
