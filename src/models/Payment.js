import mongoose from 'mongoose'

const PaymentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    method: { type: String, enum: ['stripe', 'cod', 'wallet'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    providerPaymentId: { type: String },
    meta: { type: Object },
  },
  { timestamps: true }
)

export default mongoose.model('Payment', PaymentSchema)





