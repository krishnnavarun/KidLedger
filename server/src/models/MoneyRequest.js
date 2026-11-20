import mongoose from 'mongoose';

const moneyRequestSchema = new mongoose.Schema(
  {
    childId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, 'Request amount must be at least 1 paisa'],
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer paise value',
      },
    },
    reason: {
      type: String,
      required: [true, 'Please provide a reason for the money request'],
      trim: true,
      maxlength: [255, 'Reason cannot exceed 255 characters'],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'declined'],
      default: 'pending',
      required: true,
      index: true,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
    decisionReason: {
      type: String,
      default: null,
      trim: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
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

// Compound indexes for fast retrieval
moneyRequestSchema.index({ parentId: 1, status: 1 });
moneyRequestSchema.index({ childId: 1, createdAt: -1 });

export const MoneyRequest = mongoose.model('MoneyRequest', moneyRequestSchema);
