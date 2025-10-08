import { Router } from 'express'
import Subscription from '../models/Subscription.js'
import mongoose from 'mongoose'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// Public list active plans
router.get('/', async (req, res) => {
  const plans = await Subscription.find({ isActive: true }).sort({ price: 1 })
  res.json(plans)
})

// Admin CRUD
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const plan = await Subscription.create(req.body)
    res.status(201).json(plan)
  } catch (err) {
    console.error(err)
    if (err?.name === 'ValidationError') return res.status(400).json({ error: err.message })
    res.status(500).json({ error: 'Failed to create plan' })
  }
})

router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid subscription id' })
    }
    const plan = await Subscription.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!plan) return res.status(404).json({ error: 'Plan not found' })
    res.json(plan)
  } catch (err) {
    console.error(err)
    if (err?.name === 'ValidationError') return res.status(400).json({ error: err.message })
    res.status(500).json({ error: 'Failed to update plan' })
  }
})

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid subscription id' })
    }
    await Subscription.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete plan' })
  }
})

export default router





