import mongoose from 'mongoose'

const SubscriptionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    durationDays: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    restrictions: {
      maxActiveOrders: { type: Number, default: 5 },
      prioritySupport: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
)

export default mongoose.model('Subscription', SubscriptionSchema)





