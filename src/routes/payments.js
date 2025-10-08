import { Router } from 'express'
import Payment from '../models/Payment.js'
import mongoose from 'mongoose'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import Joi from 'joi'

const router = Router()

// Validation schemas
const processSchema = Joi.object({
  orderId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  amount: Joi.number().positive().required(),
  method: Joi.string().valid('upi', 'card', 'cod', 'stripe').required(),
})

const codSchema = Joi.object({
  orderId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  amount: Joi.number().positive().required(),
})

// Available payment methods (mock)
router.get('/methods', requireAuth, async (_req, res) => {
  res.json([
    { id: 'upi', label: 'UPI' },
    { id: 'card', label: 'Credit/Debit Card' },
    { id: 'cod', label: 'Cash on Delivery' },
  ])
})

// Generic payment processing (mock)
router.post('/process', requireAuth, validate(processSchema), async (req, res) => {
  try {
    const { orderId, amount, method } = req.body || {}
    const rec = await Payment.create({ orderId, userId: req.user.id, method: method === 'card' ? 'stripe' : method, amount, status: method === 'cod' ? 'pending' : 'paid' })
    res.status(201).json({ ok: true, payment: rec })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Payment processing failed' })
  }
})

// Create COD payment record (mock)
router.post('/cod', requireAuth, validate(codSchema), async (req, res) => {
  try {
    const { orderId, amount } = req.body || {}
    const rec = await Payment.create({ orderId, userId: req.user.id, method: 'cod', amount, status: 'pending' })
    res.status(201).json(rec)
  } catch (err) {
    console.error(err)
    if (err?.name === 'ValidationError') return res.status(400).json({ error: err.message })
    res.status(500).json({ error: 'Failed to create payment' })
  }
})

// List my payments
router.get('/me', requireAuth, async (req, res) => {
  const items = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100)
  res.json(items)
})

// Alias used by some frontends
router.get('/transactions', requireAuth, async (req, res) => {
  const items = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100)
  res.json(items)
})

export default router





