import mongoose from 'mongoose';

const ruleSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: [
        'per_txn_cap',
        'daily_limit',
        'weekly_limit',
        'monthly_limit',
        'blocked_category',
        'blocked_merchant',
        'allow_only',
      ],
      required: true,
    },
    // For limits, value is a number in paise. For category/merchant, value is a string or array.
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    actionOnViolation: {
      type: String,
      enum: ['BLOCK', 'NEEDS_APPROVAL'],
      default: 'BLOCK',
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
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

// Compound index for querying active rules for a specific child
ruleSchema.index({ childId: 1, active: 1 });

export const Rule = mongoose.model('Rule', ruleSchema);
