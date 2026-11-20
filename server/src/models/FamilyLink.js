import mongoose from 'mongoose';

const familyLinkSchema = new mongoose.Schema(
  {
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    childId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'removed'],
      default: 'active',
      required: true,
    },
    consentGivenAt: {
      type: Date,
      default: Date.now,
      required: true,
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

// Compound index to guarantee a unique link between a parent and child
familyLinkSchema.index({ parentId: 1, childId: 1 }, { unique: true });

export const FamilyLink = mongoose.model('FamilyLink', familyLinkSchema);
