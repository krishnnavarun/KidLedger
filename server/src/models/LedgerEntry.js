import mongoose from 'mongoose';

const ledgerEntrySchema = new mongoose.Schema(
  {
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ['debit', 'credit'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, 'Ledger entry amount must be at least 1 paisa'],
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer paise value',
      },
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: [0, 'Balance after transaction cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer paise value',
      },
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Append-only: no updatedAt
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

// Compound index for chronological querying of a wallet's audit ledger
ledgerEntrySchema.index({ walletId: 1, createdAt: -1 });

// Guard against updates or deletions on the immutable ledger
ledgerEntrySchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  next(new Error('FATAL: LedgerEntry is immutable and cannot be updated or deleted.'));
});

export const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
