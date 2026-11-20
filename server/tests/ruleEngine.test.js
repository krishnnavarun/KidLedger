import { describe, it, expect } from 'vitest';
import { evaluateRules } from '../src/rules/ruleEngine.js';

describe('Pure Rule Engine (Unit Tests)', () => {
  it('should approve transaction when no rules exist', () => {
    const result = evaluateRules({
      transaction: { amount: 5000, category: 'gaming', merchantId: 'm1' },
      rules: [],
      historicalSpend: { today: 0, thisWeek: 0, thisMonth: 0 },
    });

    expect(result.decision).toBe('APPROVE');
    expect(result.violatedRule).toBeNull();
  });

  describe('Category and Merchant Blocking', () => {
    it('should block transaction when category is blocked', () => {
      const rules = [
        { type: 'blocked_category', value: 'gaming', active: true },
      ];

      const result = evaluateRules({
        transaction: { amount: 1000, category: 'gaming', merchantId: 'm1' },
        rules,
      });

      expect(result.decision).toBe('BLOCK');
      expect(result.reason).toContain("category 'gaming' is blocked");
    });

    it('should ignore blocked category rule if rule is inactive', () => {
      const rules = [
        { type: 'blocked_category', value: 'gaming', active: false },
      ];

      const result = evaluateRules({
        transaction: { amount: 1000, category: 'gaming', merchantId: 'm1' },
        rules,
      });

      expect(result.decision).toBe('APPROVE');
    });

    it('should block transaction when merchant is blocked', () => {
      const rules = [
        { type: 'blocked_merchant', value: 'm-steam', active: true },
      ];

      const result = evaluateRules({
        transaction: { amount: 2000, category: 'gaming', merchantId: 'm-steam' },
        rules,
      });

      expect(result.decision).toBe('BLOCK');
      expect(result.reason).toContain('merchant are blocked');
    });
  });

  describe('Allow-Only Mode (Whitelist)', () => {
    it('should allow transaction when category is in allow_only list', () => {
      const rules = [
        { type: 'allow_only', value: ['books', 'groceries'], active: true },
      ];

      const result = evaluateRules({
        transaction: { amount: 1500, category: 'books', merchantId: 'm1' },
        rules,
      });

      expect(result.decision).toBe('APPROVE');
    });

    it('should block transaction when category is not in allow_only list', () => {
      const rules = [
        { type: 'allow_only', value: ['books', 'groceries'], active: true },
      ];

      const result = evaluateRules({
        transaction: { amount: 1500, category: 'fast_food', merchantId: 'm1' },
        rules,
      });

      expect(result.decision).toBe('BLOCK');
      expect(result.reason).toContain('not on your approved spending list');
    });
  });

  describe('Limits and Caps (Boundary Edge Cases)', () => {
    it('should approve when spend + amount is exactly equal to the daily limit', () => {
      const rules = [
        { type: 'daily_limit', value: 10000, active: true }, // 100 INR
      ];

      const result = evaluateRules({
        transaction: { amount: 4000, category: 'food' },
        rules,
        historicalSpend: { today: 6000 }, // 6000 + 4000 = 10000 (exact boundary)
      });

      expect(result.decision).toBe('APPROVE');
    });

    it('should block when transaction exceeds per-transaction cap', () => {
      const rules = [
        { type: 'per_txn_cap', value: 5000, actionOnViolation: 'BLOCK', active: true },
      ];

      const result = evaluateRules({
        transaction: { amount: 5001, category: 'books' },
        rules,
      });

      expect(result.decision).toBe('BLOCK');
      expect(result.reason).toContain('exceeds single transaction cap');
    });

    it('should escalate to NEEDS_APPROVAL when configured on limit violation', () => {
      const rules = [
        { type: 'per_txn_cap', value: 5000, actionOnViolation: 'NEEDS_APPROVAL', active: true },
      ];

      const result = evaluateRules({
        transaction: { amount: 7500, category: 'books' },
        rules,
      });

      expect(result.decision).toBe('NEEDS_APPROVAL');
      expect(result.reason).toContain('exceeds single transaction cap');
    });

    it('should block when weekly limit is breached', () => {
      const rules = [
        { type: 'weekly_limit', value: 50000, active: true },
      ];

      const result = evaluateRules({
        transaction: { amount: 15000, category: 'food' },
        rules,
        historicalSpend: { today: 5000, thisWeek: 40000 }, // 40000 + 15000 = 55000 > 50000
      });

      expect(result.decision).toBe('BLOCK');
      expect(result.reason).toContain('Weekly spend limit');
    });
  });
});
