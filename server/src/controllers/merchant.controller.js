import { Merchant, seedMerchants } from '../models/Merchant.js';

export class MerchantController {
  static async listMerchants(req, res, next) {
    try {
      // Ensure default merchants are seeded in the database
      let merchants = await Merchant.find({ isActive: true }).sort({ name: 1 });
      if (merchants.length === 0) {
        await seedMerchants();
        merchants = await Merchant.find({ isActive: true }).sort({ name: 1 });
      }

      res.status(200).json({
        success: true,
        data: {
          merchants,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
