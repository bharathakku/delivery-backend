import { Router } from 'express'
import Notification from '../models/Notification.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// My notifications
router.get('/me', requireAuth, async (req, res) => {
  const items = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100)
  res.json(items)
})

// Mark as read
router.post('/:id/read', requireAuth, async (req, res) => {
  const item = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { readAt: new Date() }, { new: true })
  if (!item) return res.status(404).json({ error: 'Not found' })
  res.json(item)
})

// Admin send notification
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const item = await Notification.create(req.body)
  res.status(201).json(item)
})

export default router





