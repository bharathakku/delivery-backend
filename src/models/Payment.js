import mongoose from 'mongoose'

const PaymentSchema = new mongoose.Schema(
  {
    orderId: { 
      type: String, 
      index: true,
      sparse: true // Makes the field optional for indexing
    },
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      index: true, 
      required: true 
    },
    method: { 
      type: String, 
      enum: ['stripe', 'cod', 'wallet', 'razorpay'], 
      required: true 
    },
    amount: { 
      type: Number, 
      required: true 
    },
    currency: { 
      type: String, 
      default: 'INR' 
    },
    status: { 
      type: String, 
      enum: ['pending', 'paid', 'failed', 'refunded'], 
      default: 'pending' 
    },
    providerPaymentId: { 
      type: String,
      index: true 
    },
    meta: { 
      type: Object 
    },
  },
  { 
    timestamps: true,
    // Add compound index for better query performance
    indexes: [
      { userId: 1, status: 1 },
      { providerPaymentId: 1, method: 1, unique: true, sparse: true }
    ]
  }
)

export default mongoose.model('Payment', PaymentSchema)





