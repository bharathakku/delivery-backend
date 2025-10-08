import mongoose from 'mongoose'

const AddressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['home', 'work', 'other'], default: 'other' },
    address: { type: String, required: true },
    landmark: { type: String },
    coordinates: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
)

AddressSchema.index({ userId: 1, createdAt: -1 })

export default mongoose.model('Address', AddressSchema)
