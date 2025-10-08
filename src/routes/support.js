import { Router } from 'express'
import SupportTicket from '../models/SupportTicket.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// Create ticket
router.post('/', requireAuth, async (req, res) => {
  const { subject, description, category, priority, message } = req.body || {}
  const ticket = await SupportTicket.create({
    userId: req.user.id,
    subject,
    description: description || message,
    category,
    priority,
    messages: [{ fromRole: req.user.role, fromUserId: req.user.id, body: message || description }]
  })
  res.status(201).json(ticket)
})

// Add message
router.post('/:id/messages', requireAuth, async (req, res) => {
  const { body } = req.body || {}
  const ticket = await SupportTicket.findByIdAndUpdate(
    req.params.id,
    { $push: { messages: { fromRole: req.user.role, fromUserId: req.user.id, body } } },
    { new: true }
  )
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' })
  res.json(ticket)
})

// My tickets
router.get('/my', requireAuth, async (req, res) => {
  const tickets = await SupportTicket.find({ userId: req.user.id }).sort({ updatedAt: -1 })
  res.json(tickets)
})

// Admin list
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const tickets = await SupportTicket.find().populate('userId', 'name phone email role').sort({ updatedAt: -1 }).limit(200)
  res.json(tickets)
})

export default router





