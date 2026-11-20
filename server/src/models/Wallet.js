import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['parent', 'child'],
      required: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Wallet balance cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer paise value',
      },
    },
    currency: {
      type: String,
      default: 'INR',
      required: true,
    },
    version: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    versionKey: 'version',
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

export const Wallet = mongoose.model('Wallet', walletSchema);
