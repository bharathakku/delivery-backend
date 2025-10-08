import { Router } from 'express'
import Zone from '../models/Zone.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// Public: list active zones (for user/partner apps)
router.get('/', async (req, res) => {
  const zones = await Zone.find({}).sort({ createdAt: -1 })
  res.json(zones)
})

// Admin protected routes
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, city = '', priority = 'Medium', status = 'Active', color = '#3b82f6', coordinates } = req.body || {}
    if (!name || !Array.isArray(coordinates) || coordinates.length < 3) {
      return res.status(400).json({ error: 'Invalid payload' })
    }
    const zone = await Zone.create({ name, city, priority, status, color, coordinates })
    res.json(zone)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to create zone' })
  }
})

router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const update = req.body || {}
    if (update.coordinates && (!Array.isArray(update.coordinates) || update.coordinates.length < 3)) {
      return res.status(400).json({ error: 'Invalid coordinates' })
    }
    const zone = await Zone.findByIdAndUpdate(id, update, { new: true })
    if (!zone) return res.status(404).json({ error: 'Zone not found' })
    res.json(zone)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to update zone' })
  }
})

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const zone = await Zone.findByIdAndDelete(id)
    if (!zone) return res.status(404).json({ error: 'Zone not found' })
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to delete zone' })
  }
})

export default router
