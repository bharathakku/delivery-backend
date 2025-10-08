import mongoose from 'mongoose'

const OrderSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // partnerId removed; unified under Driver/company
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
    vehicleType: { type: String, enum: ['two-wheeler', 'three-wheeler', 'heavy-truck'], required: true },
    from: {
      address: String,
      location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], default: [0, 0] } },
    },
    to: {
      address: String,
      location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], default: [0, 0] } },
    },
    distanceKm: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    // Dynamic pricing fields
    actualDistanceKm: { type: Number, default: 0 },
    adjustedPrice: { type: Number, default: null },
    fareBreakdown: { type: Object, default: {} },
    // Proof photos uploaded by driver (pickup/delivery)
    proofs: [
      {
        url: { type: String, required: true },
        type: { type: String, enum: ['pickup', 'delivery', 'other'], default: 'pickup' },
        by: { type: String },
        note: { type: String },
        at: { type: Date, default: Date.now },
      },
    ],
    status: { type: String, enum: ['created', 'assigned', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled'], default: 'created' },
    statusHistory: [
      {
        status: String,
        at: { type: Date, default: Date.now },
        by: { type: String },
        note: { type: String },
      },
    ],
  },
  { timestamps: true }
)

export default mongoose.model('Order', OrderSchema)


