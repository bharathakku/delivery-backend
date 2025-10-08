import mongoose from 'mongoose'

const VehicleSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['two-wheeler', 'three-wheeler', 'heavy-truck'], required: true },
    title: { type: String, required: true },
    capacityKg: { type: Number, required: true },
    basePrice: { type: Number, required: true },
    perKmPrice: { type: Number, required: true },
    imageUrl: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

export default mongoose.model('Vehicle', VehicleSchema)


