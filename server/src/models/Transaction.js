import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['topup', 'transfer', 'payment', 'subscription'],
      required: true,
    },
    fromWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      default: null,
      index: true,
    },
    toWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      default: null,
      index: true,
    },
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, 'Transaction amount must be at least 1 paisa'],
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer paise value',
      },
    },
    category: {
      type: String,
      default: 'general',
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'declined', 'completed', 'failed'],
      default: 'pending',
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    ruleDecision: {
      result: {
        type: String,
        enum: ['APPROVE', 'BLOCK', 'NEEDS_APPROVAL', 'NONE'],
        default: 'NONE',
      },
      reason: {
        type: String,
        default: null,
      },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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

// Indexes for wallet transaction history searches
transactionSchema.index({ fromWalletId: 1, createdAt: -1 });
transactionSchema.index({ toWalletId: 1, createdAt: -1 });

export const Transaction = mongoose.model('Transaction', transactionSchema);
