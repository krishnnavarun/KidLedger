import mongoose from 'mongoose';

const merchantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['gaming', 'fast_food', 'books', 'entertainment', 'groceries', 'general'],
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const Merchant = mongoose.model('Merchant', merchantSchema);

export const DEFAULT_MERCHANTS = [
  { name: 'Steam Games', category: 'gaming', description: 'Video games and in-game items' },
  { name: 'Roblox Store', category: 'gaming', description: 'Robux and virtual avatar upgrades' },
  { name: 'Subway', category: 'fast_food', description: 'Sandwiches and meals' },
  { name: "McDonald's", category: 'fast_food', description: 'Burgers and fast food' },
  { name: 'Campus Bookstore', category: 'books', description: 'Textbooks, stationery, and novels' },
  { name: 'Kindle E-Books', category: 'books', description: 'Digital books and audiobooks' },
  { name: 'Cineplex Movies', category: 'entertainment', description: 'Movie tickets and snacks' },
  { name: 'Whole Foods Market', category: 'groceries', description: 'Groceries and healthy snacks' },
];

export async function seedMerchants() {
  for (const m of DEFAULT_MERCHANTS) {
    await Merchant.findOneAndUpdate(
      { name: m.name },
      { $setOnInsert: m },
      { upsert: true, new: true }
    );
  }
}
