import mongoose from 'mongoose'

const WalletTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    method: { type: String },
    refId: { type: String },
    meta: { type: Object },
  },
  { timestamps: true }
)

WalletTransactionSchema.index({ userId: 1, createdAt: -1 })

export default mongoose.model('WalletTransaction', WalletTransactionSchema)
