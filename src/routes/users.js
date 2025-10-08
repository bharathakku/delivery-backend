import { Router } from 'express'
import User from '../models/User.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// Get current user profile
router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-passwordHash')
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

// Update current user profile
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, email, phone } = req.body || {}
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, email, phone },
      { new: true }
    ).select('-passwordHash')
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// Admin: list users
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const users = await User.find().select('-passwordHash').limit(200)
  res.json(users)
})

// Admin: get single user by id
router.get('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash')
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user)
  } catch (e) {
    res.status(400).json({ error: 'Invalid user id' })
  }
})

export default router


