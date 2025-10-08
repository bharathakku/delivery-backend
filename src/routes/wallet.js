import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

// Simple in-memory wallet store (replace with MongoDB collection in production)
const balances = new Map() // key: userId -> number
const transactions = new Map() // key: userId -> array of txns

function getUserBalance(userId) {
  return balances.get(userId) ?? 0
}

function addTxn(userId, txn) {
  const list = transactions.get(userId) ?? []
  list.unshift(txn)
  transactions.set(userId, list.slice(0, 200))
}

const router = Router()

// GET /api/wallet/balance
router.get('/balance', requireAuth, async (req, res) => {
  res.json({ balance: getUserBalance(req.user.id), currency: 'INR' })
})

// POST /api/wallet/add-money { amount, method }
router.post('/add-money', requireAuth, async (req, res) => {
  try {
    const { amount, method = 'upi' } = req.body || {}
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' })

    const current = getUserBalance(req.user.id)
    const next = current + amt
    balances.set(req.user.id, next)

    const txn = {
      id: Date.now().toString(),
      type: 'credit',
      method,
      amount: amt,
      currency: 'INR',
      createdAt: new Date().toISOString(),
    }
    addTxn(req.user.id, txn)

    res.status(201).json({ ok: true, balance: next, transaction: txn })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to add money' })
  }
})

// GET /api/wallet/transactions
router.get('/transactions', requireAuth, async (req, res) => {
  res.json(transactions.get(req.user.id) ?? [])
})

export default router
