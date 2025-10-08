import mongoose from 'mongoose'

const CoordinateSchema = new mongoose.Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
}, { _id: false })

const ZoneSchema = new mongoose.Schema({
  name: { type: String, required: true },
  city: { type: String, default: '' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  color: { type: String, default: '#3b82f6' },
  coordinates: { type: [CoordinateSchema], required: true }, // polygon path
}, { timestamps: true })

export default mongoose.model('Zone', ZoneSchema)
