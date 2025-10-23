// Helper: send SMS via Twilio REST API without sdk (avoids dependency)
async function sendSMS(to, body) {
  try {
    const ACC = process.env.TWILIO_ACCOUNT_SID
    const AUTH = process.env.TWILIO_AUTH_TOKEN
    const MSG_SVC = process.env.TWILIO_MESSAGING_SERVICE_SID
    if (!ACC || !AUTH || !MSG_SVC || !to || !body) return { ok: false, skipped: true }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${ACC}/Messages.json`
    const form = new URLSearchParams()
    form.append('To', to)
    form.append('MessagingServiceSid', MSG_SVC)
    form.append('Body', body)
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${ACC}:${AUTH}`).toString('base64'),
      },
      body: form.toString(),
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      console.error('[TwilioSMS] failed', resp.status, txt)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error('[TwilioSMS] error', e)
    return { ok: false }
  }
}
import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { quoteOrder } from '../controllers/orders.js'
import mongoose from 'mongoose'
import Order from '../models/Order.js'
import Driver from '../models/Driver.js'
import User from '../models/User.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import Joi from 'joi'
import { io } from '../realtime/socket.js'

const router = Router()

router.post('/quote', quoteOrder)

// Validation schemas
const coordSchema = Joi.object({ lat: Joi.number().required(), lng: Joi.number().required() })

// Multer storage for proof uploads
const uploadsRoot = path.resolve(process.cwd(), 'uploads')
const proofsDir = path.join(uploadsRoot, 'proofs')
if (!fs.existsSync(proofsDir)) {
  fs.mkdirSync(proofsDir, { recursive: true })
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, proofsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')
    cb(null, `${Date.now()}_${safe}`)
  }
})
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } })

// Get orders assigned to the current driver
router.get('/assigned/me', requireAuth, async (req, res) => {
  try {
    // Find the driver document for the current user
    const driver = await Driver.findOne({ userId: req.user.id });
    if (!driver) {
      return res.status(403).json({ error: 'Driver profile not found' });
    }

    // Find orders assigned to this driver
    const orders = await Order.find({ 
      driverId: driver._id,
      status: { $in: ['assigned', 'accepted', 'picked_up', 'in_transit'] }
    }).sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error('Error fetching assigned orders:', err);
    res.status(500).json({ error: 'Failed to fetch assigned orders' });
  }
});

// Driver: upload proof photo (pickup/delivery)
router.post('/:id/proof', requireAuth, upload.single('proof'), async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid order id' })
    const order = await Order.findById(id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    // Only admin or assigned driver can upload
    let allowed = req.user.role === 'admin'
    if (!allowed && order.driverId) {
      const d = await Driver.findOne({ _id: order.driverId, userId: req.user.id })
      allowed = !!d
    }
    if (!allowed) return res.status(403).json({ error: 'Forbidden' })

    if (!req.file) return res.status(400).json({ error: 'No file' })
    const rel = path.join('proofs', path.basename(req.file.path))
    const type = (req.body?.type === 'delivery' || req.body?.type === 'pickup') ? req.body.type : 'other'
    const note = req.body?.note || ''
    const url = `/uploads/${rel}`
    order.proofs.push({ url, type, by: req.user.id, note })
    order.statusHistory.push({ status: 'proof_uploaded', by: req.user.id, note: type })
    await order.save()
    res.status(201).json({ ok: true, url, type })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to upload proof' })
  }
})

// Pricing helper: compute adjusted fare if driver covers extra distance
function computeAdjustedFare({ baseDistanceKm, basePrice, actualDistanceKm }) {
  const d0 = Math.max(0, Number(baseDistanceKm || 0))
  const p0 = Math.max(0, Number(basePrice || 0))
  const da = Math.max(0, Number(actualDistanceKm || 0))
  const perKm = d0 > 0 ? (p0 / d0) : 0
  const extraKm = Math.max(0, da - d0)
  const extraCharge = Number((extraKm * perKm).toFixed(2))
  const adjusted = Number((p0 + extraCharge).toFixed(2))
  return {
    baseDistanceKm: d0,
    basePrice: p0,
    perKmRate: Number(perKm.toFixed(2)),
    actualDistanceKm: da,
    extraDistanceKm: Number(extraKm.toFixed(3)),
    extraCharge,
    adjustedPrice: adjusted,
  }
}
const locationSchema = Joi.object({
  address: Joi.string().min(3).max(500).optional(),
  location: Joi.object({ type: Joi.string().valid('Point').default('Point'), coordinates: Joi.array().items(Joi.number()).length(2) }).optional(),
}).custom((val, helpers) => {
  if (!val) return helpers.error('any.required')
  if (!val.address && !val.location) return helpers.error('any.custom', { message: 'address or location required' })
  return val
})

const createOrderSchema = Joi.object({
  vehicleType: Joi.string().valid('two-wheeler', 'three-wheeler', 'heavy-truck').required(),
  from: locationSchema.required(),
  to: locationSchema.required(),
  distanceKm: Joi.number().min(0).optional(),
  price: Joi.number().min(0).optional(),
})

const statusSchema = Joi.object({
  status: Joi.string().valid('assigned', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled').required(),
  actualDistanceKm: Joi.number().min(0).optional(),
})
const actualsSchema = Joi.object({ actualDistanceKm: Joi.number().min(0).required() })
const assignSchema = Joi.object({ driverId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required() })
const cancelSchema = Joi.object({ reason: Joi.string().max(500).allow('', null) })
const rateSchema = Joi.object({ rating: Joi.number().integer().min(1).max(5).required(), review: Joi.string().max(1000).allow('', null) })

router.post('/', requireAuth, validate(createOrderSchema), async (req, res) => {
  try {
    const { vehicleType, from, to, distanceKm, price } = req.body || {}
    const fromOk = from && (from.address || (from.location && Array.isArray(from.location.coordinates)))
    const toOk = to && (to.address || (to.location && Array.isArray(to.location.coordinates)))
    if (!fromOk || !toOk) return res.status(400).json({ error: 'Invalid from/to' })
    const order = await Order.create({
      customerId: req.user.id,
      vehicleType,
      from,
      to,
      distanceKm: distanceKm || 0,
      price: price || 0,
      statusHistory: [{ status: 'created', by: req.user.id }],
    })
    res.status(201).json(order)
  } catch (err) {
    console.error(err)
    if (err?.name === 'ValidationError') return res.status(400).json({ error: err.message })
    res.status(500).json({ error: 'Failed to create order' })
  }
})

// Driver/Admin: set actuals and compute adjusted fare explicitly
router.patch('/:id/actuals', requireAuth, validate(actualsSchema), async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid order id' })
    const order = await Order.findById(id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    // Only admin or assigned driver can set actuals
    let allowed = req.user.role === 'admin'
    if (!allowed && order.driverId) {
      const d = await Driver.findOne({ _id: order.driverId, userId: req.user.id })
      allowed = !!d
    }
    if (!allowed) return res.status(403).json({ error: 'Forbidden' })
    const { actualDistanceKm } = req.body
    const fare = computeAdjustedFare({ baseDistanceKm: order.distanceKm, basePrice: order.price, actualDistanceKm })
    order.actualDistanceKm = fare.actualDistanceKm
    order.adjustedPrice = fare.adjustedPrice
    order.fareBreakdown = fare
    order.statusHistory.push({ status: 'fare_adjusted', by: req.user.id, note: JSON.stringify({ actualDistanceKm }) })
    await order.save()
    res.json({ ok: true, order })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to set actuals' })
  }
})

// Anyone authorized on the order: view fare breakdown
router.get('/:id/fare', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid order id' })
    const order = await Order.findById(id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    const role = req.user.role
    const isOwner = String(order.customerId) === String(req.user.id)
    let isDriverOnOrder = false
    if (role === 'driver' && order.driverId) {
      const d = await Driver.findOne({ _id: order.driverId, userId: req.user.id })
      isDriverOnOrder = !!d
    }
    if (!(role === 'admin' || isOwner || isDriverOnOrder)) return res.status(403).json({ error: 'Forbidden' })
    const fare = order.fareBreakdown || computeAdjustedFare({ baseDistanceKm: order.distanceKm, basePrice: order.price, actualDistanceKm: order.actualDistanceKm || order.distanceKm })
    res.json({
      orderId: order._id,
      baseDistanceKm: fare.baseDistanceKm,
      basePrice: fare.basePrice,
      perKmRate: fare.perKmRate,
      actualDistanceKm: fare.actualDistanceKm,
      extraDistanceKm: fare.extraDistanceKm,
      extraCharge: fare.extraCharge,
      adjustedPrice: order.adjustedPrice ?? fare.adjustedPrice,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to get fare breakdown' })
  }
})

// Frontend alias: Customer: my orders
router.get('/my-orders', requireAuth, requireRole('customer'), async (req, res) => {
  const items = await Order.find({ customerId: req.user.id }).sort({ createdAt: -1 }).limit(50)
  res.json(items)
})

// Order tracking details (basic: order + driver current location and timeline)
router.get('/:id/tracking', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order id' })
    }
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    let driver = null
    if (order.driverId) {
      driver = await Driver.findById(order.driverId).select('location userId vehicleType vehicleNumber').populate('userId','name phone')
    }
    res.json({
      orderId: order._id,
      status: order.status,
      timeline: order.statusHistory,
      driverLocation: driver?.location || null,
      driverBasic: driver ? {
        id: driver._id,
        name: driver.userId?.name || null,
        phone: driver.userId?.phone || null,
        vehicleType: driver.vehicleType || null,
        vehicleNumber: driver.vehicleNumber || null,
      } : null,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to get tracking info' })
  }
})

// Cancel order
router.post('/:id/cancel', requireAuth, validate(cancelSchema), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order id' })
    }
    const { reason } = req.body || {}
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'cancelled' }, $push: { statusHistory: { status: 'cancelled', by: req.user.id, note: reason } } },
      { new: true }
    )
    if (!order) return res.status(404).json({ error: 'Order not found' })
    try { io().to(`order:${order._id}`).emit('order-status', { orderId: order._id, status: 'cancelled', at: Date.now() }) } catch {}
    res.json(order)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to cancel order' })
  }
})

// Rate order (store rating info in statusHistory note for now)
router.post('/:id/rate', requireAuth, validate(rateSchema), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order id' })
    }
    const { rating, review } = req.body || {}
    const note = `rating:${rating ?? ''}${review ? ` review:${review}` : ''}`.trim()
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $push: { statusHistory: { status: 'rated', by: req.user.id, note } } },
      { new: true }
    )
    if (!order) return res.status(404).json({ error: 'Order not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to rate order' })
  }
})
// Admin: list orders
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const items = await Order.find().sort({ createdAt: -1 }).limit(200)
  res.json(items)
})

// Admin: list orders by customer
router.get('/by-customer/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const items = await Order.find({ customerId: req.params.id }).sort({ createdAt: -1 }).limit(200)
    res.json(items)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to get orders for customer' })
  }
})

// Customer: my orders
router.get('/my', requireAuth, requireRole('customer'), async (req, res) => {
  const items = await Order.find({ customerId: req.user.id }).sort({ createdAt: -1 }).limit(50)
  res.json(items)
})

// Get single order (role-based visibility)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid order id' })
    const order = await Order.findById(id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    const role = req.user.role
    const isOwner = String(order.customerId) === String(req.user.id)
    let isDriverOnOrder = false
    if (role === 'driver' && order.driverId) {
      const d = await Driver.findOne({ _id: order.driverId, userId: req.user.id })
      isDriverOnOrder = !!d
    }
    if (!(role === 'admin' || isOwner || isDriverOnOrder)) return res.status(403).json({ error: 'Forbidden' })
    // Attach minimal customer info when visible
    let customer = null
    try {
      const u = await User.findById(order.customerId).select('name phone')
      if (u) customer = { id: u._id, name: u.name || null, phone: u.phone || null }
    } catch {}
    const payload = order.toObject ? order.toObject() : order
    res.json({ ...payload, customer })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to get order' })
  }
})

// Driver: my assigned orders (map authenticated User -> Driver -> orders)
router.get('/assigned/me', requireAuth, requireRole('driver'), async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id })
  if (!driver) return res.json([])
  const items = await Order.find({ driverId: driver._id }).sort({ createdAt: -1 }).limit(50)
  res.json(items)
})

// Update status
router.patch('/:id/status', requireAuth, validate(statusSchema), async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order id' })
    }
    const { status, actualDistanceKm } = req.body || {}
    const valid = ['assigned', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled']
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const existing = await Order.findById(id)
    if (!existing) return res.status(404).json({ error: 'Order not found' })

    let updates = { status }

    // If driver accepts, attach driverId from authenticated driver if missing
    if (status === 'accepted' && !existing.driverId && req.user?.role === 'driver') {
      try {
        const driver = await Driver.findOne({ userId: req.user.id }).select('_id')
        if (driver?._id) updates.driverId = driver._id
      } catch {}
    }

    // If actual distance is provided at in_transit/delivered, compute adjusted fare
    if (typeof actualDistanceKm === 'number' && (status === 'in_transit' || status === 'delivered')) {
      const fare = computeAdjustedFare({ baseDistanceKm: existing.distanceKm, basePrice: existing.price, actualDistanceKm })
      updates = { ...updates, actualDistanceKm: fare.actualDistanceKm, adjustedPrice: fare.adjustedPrice, fareBreakdown: fare }
    }

    const order = await Order.findByIdAndUpdate(
      id,
      { $set: updates, $push: { statusHistory: { status, by: req.user.id } } },
      { new: true }
    )
    if (!order) return res.status(404).json({ error: 'Order not found' })

    // Emit real-time status update so customer/admin UIs update immediately
    try { io().to(`order:${order._id}`).emit('order-status', { orderId: order._id, status, at: Date.now() }) } catch {}

    // Notify customer by SMS on delivery complete
    if (status === 'delivered') {
      try {
        let customerPhone = null
        try {
          const u = await User.findById(order.customerId).select('phone')
          customerPhone = u?.phone || null
        } catch {}
        if (customerPhone) {
          // Ensure E.164 (very basic): if no + prefix, assume India +91
          const to = customerPhone.startsWith('+') ? customerPhone : `+91${customerPhone.replace(/[^0-9]/g,'')}`
          const msg = `Your order ${order._id} has been delivered. Thank you for choosing us!`
          await sendSMS(to, msg)
        }
      } catch (e) {
        console.error('Failed to send delivery SMS', e)
      }
    }
    res.json(order)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update order status' })
  }
})

// Manual assign driver (admin)
router.post('/:id/assign', requireAuth, requireRole('admin'), validate(assignSchema), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order id' })
    }
    const { driverId } = req.body || {}
    if (!driverId) return res.status(400).json({ error: 'driverId required' })
    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({ error: 'Invalid driverId' })
    }
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'assigned', driverId }, $push: { statusHistory: { status: 'assigned', by: req.user.id } } },
      { new: true }
    )
    if (!order) return res.status(404).json({ error: 'Order not found' })
    try {
      // Notify anyone watching the order
      io().to(`order:${order._id}`).emit('order-status', { orderId: order._id, status: 'assigned', at: Date.now() })
      // Notify the assigned driver
      io().to(`driver:${driverId}`).emit('order-assigned', {
        orderId: order._id,
        status: order.status,
        vehicleType: order.vehicleType,
        price: order.price,
        distanceKm: order.distanceKm,
        from: order.from,
        to: order.to,
        at: Date.now(),
      })
    } catch {}
    res.json(order)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to assign driver' })
  }
})

function haversineKm(a, b) {
  const toRad = (x) => (x * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Auto-assign nearest online driver matching vehicle type
router.post('/:id/auto-assign', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    const fromLoc = order.from?.location?.coordinates || [0, 0]
    const [fromLng, fromLat] = fromLoc
    const vehicleType = order.vehicleType

    // Prefer MongoDB geospatial query if available
    let chosen = null
    try {
      const near = await Driver.find({
        isOnline: true,
        isActive: true,
        ...(vehicleType ? { vehicleType } : {}),
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [fromLng, fromLat] },
            $maxDistance: 15000, // 15 km radius
          },
        },
      })
        .limit(1)
      if (near && near.length) chosen = near[0]
    } catch {}

    // Fallback: in-memory haversine
    if (!chosen) {
      const drivers = await Driver.find({ isOnline: true, isActive: true, ...(vehicleType ? { vehicleType } : {}) }).limit(500)
      if (!drivers.length) return res.status(409).json({ error: 'No online drivers' })
      let best = null
      for (const d of drivers) {
        const [lng, lat] = d.location?.coordinates || [0, 0]
        const dist = haversineKm({ lat: fromLat, lng: fromLng }, { lat, lng })
        if (!best || dist < best.dist) best = { d, dist }
      }
      chosen = best?.d || null
    }

    if (!chosen) return res.status(409).json({ error: 'No drivers found' })
    order.driverId = chosen._id
    order.status = 'assigned'
    order.statusHistory.push({ status: 'assigned', by: req.user.id, note: 'auto' })
    await order.save()
    try { io().to(`order:${order._id}`).emit('order-status', { orderId: order._id, status: 'assigned', at: Date.now() }) } catch {}
    res.json(order)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Auto-assign failed' })
  }
})

export default router


