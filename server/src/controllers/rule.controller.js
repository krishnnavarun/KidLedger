import { Rule } from '../models/Rule.js';
import { FamilyService } from '../services/family.service.js';
import { AppError } from '../middleware/errorHandler.js';

export class RuleController {
  /**
   * Parent creates a spending rule for their child.
   */
  static async createRule(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const { childId, type, value, actionOnViolation } = req.body;

      // 1. Verify parent has active custody/relationship with this child
      await FamilyService.verifyParentChildAccess(parentId, childId);

      // 2. Validate value format based on rule type
      if (['per_txn_cap', 'daily_limit', 'weekly_limit', 'monthly_limit'].includes(type)) {
        if (!Number.isInteger(value) || value <= 0) {
          throw new AppError(
            `Rule value for '${type}' must be a positive integer in paise`,
            400,
            'INVALID_RULE_VALUE'
          );
        }
      }

      // 3. Create the rule
      const rule = await Rule.create({
        parentId,
        childId,
        type,
        value,
        actionOnViolation: actionOnViolation || 'BLOCK',
        active: true,
      });

      res.status(201).json({
        success: true,
        data: {
          rule,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Parent retrieves all rules configured for a specific child.
   */
  static async getRulesForChild(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const { childId } = req.query;

      if (!childId) {
        throw new AppError('Query parameter childId is required', 400, 'MISSING_CHILD_ID');
      }

      // Verify access
      await FamilyService.verifyParentChildAccess(parentId, childId);

      const rules = await Rule.find({ childId }).sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        data: {
          rules,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Parent modifies or toggles a rule.
   */
  static async updateRule(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const { id } = req.params;
      const { active, value, actionOnViolation } = req.body;

      const rule = await Rule.findOne({ _id: id, parentId });
      if (!rule) {
        throw new AppError('Rule not found or unauthorized', 404, 'RULE_NOT_FOUND');
      }

      if (active !== undefined) rule.active = active;
      if (actionOnViolation !== undefined) rule.actionOnViolation = actionOnViolation;
      if (value !== undefined) {
        if (['per_txn_cap', 'daily_limit', 'weekly_limit', 'monthly_limit'].includes(rule.type)) {
          if (!Number.isInteger(value) || value <= 0) {
            throw new AppError(
              `Rule value for '${rule.type}' must be a positive integer in paise`,
              400,
              'INVALID_RULE_VALUE'
            );
          }
        }
        rule.value = value;
      }

      await rule.save();

      res.status(200).json({
        success: true,
        data: {
          rule,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Parent deletes a rule.
   */
  static async deleteRule(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const { id } = req.params;

      const rule = await Rule.findOneAndDelete({ _id: id, parentId });
      if (!rule) {
        throw new AppError('Rule not found or unauthorized', 404, 'RULE_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: {
          message: 'Rule deleted successfully',
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
