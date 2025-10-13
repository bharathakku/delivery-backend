import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import Driver from '../models/Driver.js'
import User from '../models/User.js'
import Order from '../models/Order.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import twilio from 'twilio'

const router = express.Router()

// Multer storage for KYC document uploads
const uploadsRoot = path.resolve(process.cwd(), 'uploads')
const kycDir = path.join(uploadsRoot, 'kyc')
if (!fs.existsSync(kycDir)) {
  fs.mkdirSync(kycDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, kycDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')
    cb(null, `${Date.now()}_${safeName}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
})

// Driver: my profile
// Allow any authenticated user; if a driver profile exists it will be returned.
// This avoids 403 when the JWT role is not yet 'driver' right after OTP flow.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user.id })
      .populate('userId', 'name email phone')
    if (!driver) {
      // Return a non-error response to let frontends hydrate gracefully
      return res.json({ exists: false, isOnline: false })
    }
    res.json(driver)
  } catch (error) {
    console.error('Error fetching driver profile:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin: list drivers
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { online, active, vehicleType, lat, lng, maxDistanceMeters } = req.query || {}
    const q = {}
    if (typeof online !== 'undefined') q.isOnline = String(online) === 'true'
    if (typeof active !== 'undefined') q.isActive = String(active) === 'true'
    if (vehicleType) q.vehicleType = vehicleType
    // Base query
    let query = Driver.find(q).populate('userId', 'name email phone')
    // Optional near filtering
    const hasNear = lat && lng
    if (hasNear) {
      const maxD = Math.max(0, Number(maxDistanceMeters) || 15000)
      q.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          $maxDistance: maxD,
        },
      }
      query = Driver.find(q).populate('userId', 'name email phone')
    }
    const drivers = await query.limit(200)
    res.json(drivers)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to list drivers' })
  }
})

// Admin: get one driver by id (placed AFTER '/me' so '/me' isn't captured as an id)
router.get('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const driver = await Driver.findById(req.params.id).populate('userId', 'name email phone')
  if (!driver) return res.status(404).json({ error: 'Driver not found' })
  res.json(driver)
})

// Admin: driver stats (trips, earnings, today metrics, subscription)
router.get('/:id/stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id
    const driver = await Driver.findById(id).populate('userId','phone name')
    if (!driver) return res.status(404).json({ error: 'Driver not found' })
    const all = await Order.find({ driverId: id })
    const delivered = all.filter(o => String(o.status).toLowerCase() === 'delivered')
    const totalTrips = delivered.length
    const totalEarnings = delivered.reduce((s,o)=> s + Number(o.adjustedPrice ?? o.price ?? 0), 0)
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0)
    const todayDelivered = delivered.filter(o => new Date(o.updatedAt || o.createdAt) >= startOfDay)
    const todayTrips = todayDelivered.length
    const todayEarnings = todayDelivered.reduce((s,o)=> s + Number(o.adjustedPrice ?? o.price ?? 0), 0)
    const subExpiry = driver.subscriptionExpiry ? new Date(driver.subscriptionExpiry) : null
    const now = new Date()
    const daysLeft = subExpiry ? Math.ceil((subExpiry - now) / (1000*60*60*24)) : null
    const expired = subExpiry ? (subExpiry < now) : false
    res.json({
      totalTrips,
      totalEarnings,
      todayTrips,
      todayEarnings,
      subscriptionPlan: driver.subscriptionPlan || null,
      subscriptionExpiry: subExpiry?.toISOString() || null,
      daysLeft,
      expired,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to get stats' })
  }
})

// Admin: send subscription expiry reminder via SMS
router.post('/:id/subscription/remind', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id
    const driver = await Driver.findById(id).populate('userId','phone name')
    if (!driver) return res.status(404).json({ error: 'Driver not found' })
    const phone = driver.userId?.phone
    if (!phone) return res.status(400).json({ error: 'Driver phone not available' })
    const RAW_SID = (process.env.TWILIO_SID || '').trim()
    const RAW_AUTH = (process.env.TWILIO_AUTH_TOKEN || '').trim()
    const RAW_FROM = (process.env.TWILIO_PHONE_NUMBER || '').trim()
    const MSG_SVC = (process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim()
    const client = (RAW_SID && RAW_AUTH) ? twilio(RAW_SID, RAW_AUTH) : null
    if (!client) return res.status(400).json({ error: 'Twilio not configured' })
    const when = driver.subscriptionExpiry ? new Date(driver.subscriptionExpiry).toLocaleDateString() : 'soon'
    const body = `Reminder: Your subscription ${driver.subscriptionPlan ? '('+driver.subscriptionPlan+') ' : ''}expires on ${when}. Please renew to continue receiving orders.`
    const params = { to: phone, body }
    if (MSG_SVC) params.messagingServiceSid = MSG_SVC; else params.from = RAW_FROM
    await client.messages.create(params)
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to send reminder' })
  }
})

// Driver: update location
router.patch('/me/location', requireAuth, async (req, res) => {
  const { lat, lng } = req.body || {}
  const driver = await Driver.findOneAndUpdate(
    { userId: req.user.id },
    { 
      $set: { location: { type: 'Point', coordinates: [lng, lat] } },
      $setOnInsert: { userId: req.user.id, isOnline: false, location: { type: 'Point', coordinates: [lng || 0, lat || 0] } }
    },
    { new: true, upsert: true }
  )
  res.json(driver)
})

// Driver: toggle online/offline
router.patch('/me/online', requireAuth, async (req, res) => {
  const { isOnline } = req.body || {}
  const driver = await Driver.findOneAndUpdate(
    { userId: req.user.id },
    { 
      $set: { isOnline: !!isOnline },
      $setOnInsert: { userId: req.user.id, location: { type: 'Point', coordinates: [0, 0] } }
    },
    { new: true, upsert: true }
  )
  res.json({ ok: true, isOnline: driver.isOnline })
})

// Create/Update partner info on Driver model (upsert if missing)
router.put('/me', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    const driver = await Driver.findOneAndUpdate(
      { userId: req.user.id },
      { 
        $set: req.body || {},
        $setOnInsert: { userId: req.user.id, isOnline: false }
      },
      { new: true, upsert: true }
    )
    res.json(driver)
  } catch (e) {
    console.error('PUT /drivers/me failed:', e)
    res.status(500).json({ error: 'Failed to save partner profile' })
  }
})

// Lightweight ping to verify router is mounted in prod
router.get('/ping', (_req, res) => {
  res.json({ ok: true, service: 'drivers', time: new Date().toISOString() })
})

// Driver: upload KYC documents (Aadhaar/PAN/DL/RC/Vehicle Photo)
// Accept multipart form-data with fields: aadhar, pan, drivingLicense, vehicleRC, vehiclePicture
router.post(
  '/me/kyc/upload',
  requireAuth,
  requireRole('driver'),
  upload.fields([
    { name: 'aadhar', maxCount: 1 },
    { name: 'pan', maxCount: 1 },
    { name: 'drivingLicense', maxCount: 1 },
    { name: 'vehicleRC', maxCount: 1 },
    { name: 'vehiclePicture', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      let driver = await Driver.findOne({ userId: req.user.id })
      // Auto-create driver profile if missing so KYC can proceed during signup
      if (!driver) {
        driver = await Driver.findOneAndUpdate(
          { userId: req.user.id },
          { $setOnInsert: { userId: req.user.id, isOnline: false } },
          { new: true, upsert: true }
        )
      }

      const files = req.files || {}
      const toPush = []

      const pushDoc = (type, file) => {
        if (!file) return
        const relPath = path.join('kyc', path.basename(file.path))
        toPush.push({ type, url: `/uploads/${relPath}`, status: 'pending' })
      }

      pushDoc('aadhar', files.aadhar?.[0])
      pushDoc('pan', files.pan?.[0])
      pushDoc('drivingLicense', files.drivingLicense?.[0])
      pushDoc('vehicleRC', files.vehicleRC?.[0])
      pushDoc('vehiclePicture', files.vehiclePicture?.[0])

      if (!toPush.length) return res.status(400).json({ error: 'No files uploaded' })

      // Persist KYC metadata (text fields) in Driver profile
      const {
        fullName,
        email,
        aadharNumber,
        panNumber,
        drivingLicense: dlNumber,
        vehicleNumber,
        vehicleType,
      } = req.body || {}

      if (fullName) driver.fullName = fullName
      if (email) driver.email = email
      if (aadharNumber) driver.aadharNumber = aadharNumber
      if (panNumber) driver.panNumber = panNumber
      if (dlNumber) driver.drivingLicense = dlNumber
      if (vehicleNumber) driver.vehicleNumber = vehicleNumber
      if (vehicleType) driver.vehicleType = vehicleType

      driver.documents.push(...toPush)
      await driver.save()

      res.status(201).json({ ok: true, driver: {
        id: driver._id,
        fullName: driver.fullName,
        email: driver.email,
        aadharNumber: driver.aadharNumber,
        panNumber: driver.panNumber,
        drivingLicense: driver.drivingLicense,
        vehicleNumber: driver.vehicleNumber,
        vehicleType: driver.vehicleType,
        documents: driver.documents,
      } })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Upload failed' })
    }
  }
)

// Fallback: partner documents upload (single document at a time)
// Accepts multipart form-data with: document (file), type (aadhar|pan|drivingLicense|vehicleRC|vehiclePicture)
router.post(
  '/partner/documents',
  requireAuth,
  requireRole('driver'),
  upload.single('document'),
  async (req, res) => {
    try {
      const driver = await Driver.findOne({ userId: req.user.id })
      if (!driver) return res.status(404).json({ error: 'Partner profile not found' })

      const file = req.file
      const { type } = req.body || {}
      const allowed = new Set(['aadhar', 'pan', 'drivingLicense', 'vehicleRC', 'vehiclePicture'])

      if (!file) return res.status(400).json({ error: 'No file uploaded' })
      if (!allowed.has(type)) return res.status(400).json({ error: 'Invalid document type' })

      const relPath = path.join('kyc', path.basename(file.path))
      const doc = { type, url: `/uploads/${relPath}`, status: 'pending' }
      driver.documents.push(doc)
      await driver.save()

      res.status(201).json({ ok: true, document: doc, driverId: driver._id })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Upload failed' })
    }
  }
)

// Admin: update a specific document's status (approved/rejected/pending)
router.patch('/:id/documents/:docId', requireAuth, requireRole('admin'), async (req, res) => {
  const { status } = req.body || {}
  if (!['pending', 'approved', 'rejected'].includes(status || '')) return res.status(400).json({ error: 'Invalid status' })
  const driver = await Driver.findById(req.params.id)
  if (!driver) return res.status(404).json({ error: 'Driver not found' })
  const doc = driver.documents.id(req.params.docId)
  if (!doc) return res.status(404).json({ error: 'Document not found' })
  doc.status = status
  await driver.save()
  res.json({ ok: true, document: doc, driverId: driver._id })
})

// Admin: set driver active state
router.patch('/:id/state', requireAuth, requireRole('admin'), async (req, res) => {
  const { isActive } = req.body || {}
  const driver = await Driver.findByIdAndUpdate(req.params.id, { isActive: !!isActive }, { new: true })
  if (!driver) return res.status(404).json({ error: 'Driver not found' })
  res.json({ ok: true, driver })
})

// Admin: approve partner -> set active and mark all documents approved, send notification if possible
router.post('/:id/approve', requireAuth, requireRole('admin'), async (req, res) => {
  const id = req.params.id
  const driver = await Driver.findById(id)
  if (!driver) return res.status(404).json({ error: 'Driver not found' })

  // Approve all documents
  driver.documents = (driver.documents || []).map(d => ({ ...d.toObject?.() || d, status: 'approved' }))
  driver.isActive = true
  await driver.save()

  // Try to send SMS notification if Twilio configured and phone is present
  let notified = false
  try {
    const RAW_SID = (process.env.TWILIO_SID || '').trim()
    const RAW_AUTH = (process.env.TWILIO_AUTH_TOKEN || '').trim()
    const RAW_FROM = (process.env.TWILIO_PHONE_NUMBER || '').trim()
    const MSG_SVC = (process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim()
    const client = (RAW_SID && RAW_AUTH) ? twilio(RAW_SID, RAW_AUTH) : null
    const user = await User.findById(driver.userId)
    const to = user?.phone
    if (client && to && (RAW_FROM || MSG_SVC)) {
      const params = { to, body: 'Your partner account has been approved. You now have access to the app features.' }
      if (MSG_SVC) params.messagingServiceSid = MSG_SVC; else params.from = RAW_FROM
      await client.messages.create(params)
      notified = true
    }
  } catch (e) {
    try { console.warn('[Admin Approve] SMS notify failed:', e?.message || String(e)) } catch {}
  }

  res.json({ ok: true, driver, notified })
})

export default router
