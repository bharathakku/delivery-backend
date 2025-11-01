import mongoose from 'mongoose'

const DriverSchema = new mongoose.Schema(
  {
    // Core identity
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    // Vehicle association (optional)
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },

    // Operational state
    isOnline: { type: Boolean, default: false },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    capacityKg: { type: Number, default: 50 },
    // Live presence heartbeat
    lastSeenAt: { type: Date, default: null },
    
    // Partner/company details (unified model for Partner + Driver)
    companyName: { type: String },
    
    // KYC metadata (submitted along with documents)
    fullName: { type: String },
    email: { type: String },
    aadharNumber: { type: String },
    panNumber: { type: String },
    drivingLicense: { type: String },
    vehicleNumber: { type: String },
    vehicleType: { type: String },
    
    documents: [
      {
        type: { type: String },
        url: { type: String },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      },
    ],
    isActive: { type: Boolean, default: false },

    // Compatibility: keep partnerId optional for older data
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner' },

    // Subscription tracking (admin <> partner)
    subscriptionPlan: { type: String, default: null },
    subscriptionExpiry: { type: Date, default: null },
  },
  { timestamps: true }
)

DriverSchema.index({ location: '2dsphere' })

export default mongoose.model('Driver', DriverSchema)


