import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import Message from '../models/Message.js'
import mongoose from 'mongoose'
import { io } from '../realtime/socket.js'

const router = Router()

// Helper: default thread id between admin and a user
function adminThreadIdFor(userId) {
  return `admin:${userId}`
}

// List threads for current user (for now only admin<->user thread)
router.get('/threads/me', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const userId = req.query.userId
      if (userId) {
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ error: 'invalid userId' })
        const tid = adminThreadIdFor(userId)
        const last = await Message.findOne({ threadId: tid }).sort({ createdAt: -1 })
        return res.json([{ threadId: tid, lastMessage: last || null }])
      }
      // List all admin:* threads with their last message
      const items = await Message.aggregate([
        { $match: { threadId: { $regex: /^admin:/ } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$threadId', lastMessage: { $first: '$$ROOT' } } },
        { $project: { _id: 0, threadId: '$_id', lastMessage: 1 } },
        { $limit: 50 }
      ])
      return res.json(items)
    }
    // Non-admin: only their admin thread
    const tid = adminThreadIdFor(req.user.id)
    const last = await Message.findOne({ threadId: tid }).sort({ createdAt: -1 })
    res.json([{ threadId: tid, lastMessage: last || null }])
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to load threads' })
  }
})

// Get messages of a thread
router.get('/threads/:id/messages', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const since = req.query.since ? new Date(req.query.since) : null
    const q = { threadId: id }
    if (since && !isNaN(since.getTime())) q.createdAt = { $gt: since }
    const items = await Message.find(q).sort({ createdAt: 1 }).limit(200)
    res.json(items)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to load messages' })
  }
})

// Send message
router.post('/threads/:id/messages', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { text } = req.body || {}
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'text required' })

    // Derive toUserId for admin<->user threads
    let toUserId = null
    if (id.startsWith('admin:')) {
      const userId = id.split(':')[1]
      if (mongoose.Types.ObjectId.isValid(userId)) {
        toUserId = req.user.role === 'admin' ? userId : null
      }
    }

    const msg = await Message.create({
      threadId: id,
      fromUserId: req.user.id,
      toUserId,
      text: String(text).trim(),
    })

    try { io().to(`thread:${id}`).emit('chat:message', msg) } catch {}
    res.status(201).json(msg)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

export default router
