import { FamilyService } from '../services/family.service.js';

export class FamilyController {
  static async createChild(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const result = await FamilyService.createChildAccount(parentId, req.body);

      res.status(201).json({
        success: true,
        data: {
          child: result.child,
          familyLink: result.familyLink,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getChildren(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const children = await FamilyService.getChildren(parentId);

      res.status(200).json({
        success: true,
        data: {
          children,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
