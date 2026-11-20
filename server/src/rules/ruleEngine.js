/**
 * Pure Rule Engine for KidLedger Wallet.
 *
 * Designed as a 100% pure function with zero database or network dependencies.
 * Given a transaction context, active rules, and historical spend aggregates,
 * it deterministically computes the authorization outcome.
 *
 * @param {Object} params
 * @param {Object} params.transaction - { amount: Number, category: String, merchantId: String }
 * @param {Array} params.rules - Array of active Rule objects
 * @param {Object} params.historicalSpend - { today: Number, thisWeek: Number, thisMonth: Number }
 * @returns {Object} { decision: 'APPROVE' | 'BLOCK' | 'NEEDS_APPROVAL', reason: String, violatedRule?: Object }
 */
export function evaluateRules({ transaction, rules = [], historicalSpend = { today: 0, thisWeek: 0, thisMonth: 0 } }) {
  const { amount, category, merchantId } = transaction;

  // Active rules filter
  const activeRules = rules.filter((r) => r.active !== false);

  // 1. Check Blocked Merchants (Hard Block)
  for (const rule of activeRules) {
    if (rule.type === 'blocked_merchant') {
      const blockedId = rule.value?.toString();
      if (blockedId && merchantId && blockedId === merchantId.toString()) {
        return {
          decision: 'BLOCK',
          reason: `Purchases from this merchant are blocked by parental controls`,
          violatedRule: rule,
        };
      }
    }
  }

  // 2. Check Blocked Categories (Hard Block)
  for (const rule of activeRules) {
    if (rule.type === 'blocked_category') {
      const blockedCat = String(rule.value).toLowerCase();
      if (category && category.toLowerCase() === blockedCat) {
        return {
          decision: 'BLOCK',
          reason: `Spending in category '${category}' is blocked by parental controls`,
          violatedRule: rule,
        };
      }
    }
  }

  // 3. Check Allow-Only List (Whitelist mode)
  for (const rule of activeRules) {
    if (rule.type === 'allow_only') {
      const allowedItems = Array.isArray(rule.value)
        ? rule.value.map((v) => String(v).toLowerCase())
        : [String(rule.value).toLowerCase()];

      const isCategoryAllowed = category && allowedItems.includes(category.toLowerCase());
      const isMerchantAllowed = merchantId && allowedItems.includes(merchantId.toString().toLowerCase());

      if (!isCategoryAllowed && !isMerchantAllowed) {
        return {
          decision: 'BLOCK',
          reason: `Category '${category}' is not on your approved spending list`,
          violatedRule: rule,
        };
      }
    }
  }

  // 4. Check Per-Transaction Cap
  for (const rule of activeRules) {
    if (rule.type === 'per_txn_cap') {
      const cap = Number(rule.value);
      if (amount > cap) {
        const action = rule.actionOnViolation || 'BLOCK';
        return {
          decision: action,
          reason: `Amount (₹${(amount / 100).toFixed(2)}) exceeds single transaction cap of ₹${(cap / 100).toFixed(2)}`,
          violatedRule: rule,
        };
      }
    }
  }

  // 5. Check Daily Limit
  for (const rule of activeRules) {
    if (rule.type === 'daily_limit') {
      const limit = Number(rule.value);
      const totalSpend = (historicalSpend.today || 0) + amount;
      if (totalSpend > limit) {
        const action = rule.actionOnViolation || 'BLOCK';
        return {
          decision: action,
          reason: `Daily spend limit of ₹${(limit / 100).toFixed(2)} exceeded (Requested: ₹${(amount / 100).toFixed(2)}, Spent today: ₹${((historicalSpend.today || 0) / 100).toFixed(2)})`,
          violatedRule: rule,
        };
      }
    }
  }

  // 6. Check Weekly Limit
  for (const rule of activeRules) {
    if (rule.type === 'weekly_limit') {
      const limit = Number(rule.value);
      const totalSpend = (historicalSpend.thisWeek || 0) + amount;
      if (totalSpend > limit) {
        const action = rule.actionOnViolation || 'BLOCK';
        return {
          decision: action,
          reason: `Weekly spend limit of ₹${(limit / 100).toFixed(2)} exceeded (Requested: ₹${(amount / 100).toFixed(2)}, Spent this week: ₹${((historicalSpend.thisWeek || 0) / 100).toFixed(2)})`,
          violatedRule: rule,
        };
      }
    }
  }

  // 7. Check Monthly Limit
  for (const rule of activeRules) {
    if (rule.type === 'monthly_limit') {
      const limit = Number(rule.value);
      const totalSpend = (historicalSpend.thisMonth || 0) + amount;
      if (totalSpend > limit) {
        const action = rule.actionOnViolation || 'BLOCK';
        return {
          decision: action,
          reason: `Monthly spend limit of ₹${(limit / 100).toFixed(2)} exceeded (Requested: ₹${(amount / 100).toFixed(2)}, Spent this month: ₹${((historicalSpend.thisMonth || 0) / 100).toFixed(2)})`,
          violatedRule: rule,
        };
      }
    }
  }

  // 8. If all checks pass
  return {
    decision: 'APPROVE',
    reason: 'Transaction satisfies all spending rules',
    violatedRule: null,
  };
}
