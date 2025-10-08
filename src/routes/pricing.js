import { Router } from 'express'
import Pricing from '../models/Pricing.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// Public: get all active pricing rows
router.get('/', async (req, res) => {
  const rows = await Pricing.find({ active: true }).sort({ vehicleId: 1 })
  res.json(rows)
})

// Public: get single pricing by vehicleId
router.get('/:vehicleId', async (req, res) => {
  const { vehicleId } = req.params
  const row = await Pricing.findOne({ vehicleId, active: true })
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(row)
})

// Admin CRUD
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { vehicleId, base, perKm, currency = 'INR', city = '' } = req.body || {}
    if (!vehicleId || base == null || perKm == null) return res.status(400).json({ error: 'Missing fields' })
    const created = await Pricing.findOneAndUpdate(
      { vehicleId },
      { vehicleId, base, perKm, currency, city, active: true },
      { upsert: true, new: true }
    )
    res.json(created)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Create failed' })
  }
})

router.put('/:vehicleId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { vehicleId } = req.params
    const update = req.body || {}
    const row = await Pricing.findOneAndUpdate({ vehicleId }, update, { new: true })
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json(row)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Update failed' })
  }
})

router.delete('/:vehicleId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { vehicleId } = req.params
    const row = await Pricing.findOneAndUpdate({ vehicleId }, { active: false }, { new: true })
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Delete failed' })
  }
})

export default router
