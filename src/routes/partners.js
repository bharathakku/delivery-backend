import { Router } from 'express'
import mongoose from 'mongoose'
import Partner from '../models/Partner.js'
import Driver from '../models/Driver.js'
import User from '../models/User.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

function isValidObjectId(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)
}

// Admin: list partners
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  // Unified view: prefer Driver docs if present; fall back to Partner
  const drivers = await Driver.find().populate('userId', '-passwordHash')
  if (drivers && drivers.length) return res.json(drivers)
  const partners = await Partner.find().populate('userId', '-passwordHash')
  res.json(partners)
})

// Driver (formerly partner): get my profile
router.get('/me', requireAuth, requireRole('driver'), async (req, res) => {
  // Single source of truth in Driver collection
  if (!isValidObjectId(req.user?.id)) {
    return res.status(400).json({ error: 'Invalid user id' })
  }
  try {
    const driver = await Driver.findOne({ userId: req.user.id })
    if (!driver) return res.status(404).json({ error: 'Partner profile not found' })
    res.json(driver)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// Driver (formerly partner): update my profile
router.put('/me', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    if (!isValidObjectId(req.user?.id)) {
      return res.status(400).json({ error: 'Invalid user id' })
    }
    const driver = await Driver.findOneAndUpdate(
      { userId: req.user.id },
      req.body,
      { new: true }
    )
    if (!driver) return res.status(404).json({ error: 'Partner profile not found' })
    res.json(driver)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// Admin: create partner for a user (bootstrap)
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { userId, companyName, ...rest } = req.body || {}
  if (!isValidObjectId(userId)) {
    return res.status(400).json({ error: 'Invalid userId' })
  }
  const user = await User.findById(userId)
  if (!user) return res.status(404).json({ error: 'User not found' })

  // Ensure a Driver record exists (unified model)
  let driver = await Driver.findOne({ userId })
  if (driver) return res.status(409).json({ error: 'Partner already exists' })
  driver = await Driver.create({ userId, companyName, isActive: true, ...rest })
  res.status(201).json(driver)
})

// Admin: update partner
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid id' })
  }
  try {
    // Try Driver first, then fallback to Partner for legacy records
    let driver = await Driver.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (driver) return res.json(driver)
    const partner = await Partner.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!partner) return res.status(404).json({ error: 'Partner not found' })
    res.json(partner)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update partner' })
  }
})

export default router


