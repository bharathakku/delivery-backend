import mongoose from 'mongoose'

const PricingSchema = new mongoose.Schema({
  vehicleId: { type: String, required: true, unique: true }, // e.g., 'heavy-truck', 'three-wheeler', 'two-wheeler'
  base: { type: Number, required: true, min: 0 },
  perKm: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  city: { type: String, default: '' }, // optional, future scope
  active: { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.model('Pricing', PricingSchema)
