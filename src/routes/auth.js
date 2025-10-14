import { Router } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import VerificationToken from '../models/VerificationToken.js'
import { sendOtp, verifyOtp } from '../controllers/auth.js'

const router = Router()

function signToken(user) {
  const payload = { id: user._id.toString(), role: user.role, email: user.email, name: user.name }
  const secret = process.env.JWT_SECRET || 'dev_secret'
  const expiresIn = '7d'
  return jwt.sign(payload, secret, { expiresIn })
}

router.post('/signup', async (req, res) => {
  try {
    let { name, email, phone, password, role } = req.body || {}
    email = typeof email === 'string' ? email.trim().toLowerCase() : ''
    phone = typeof phone === 'string' ? phone.trim() : ''
    if (!name || !email || !password || !role) return res.status(400).json({ error: 'Missing fields' })
    // Normalize legacy 'partner' role to 'driver'
    if (role === 'partner') role = 'driver'
    if (!['admin', 'customer', 'driver'].includes(role)) return res.status(400).json({ error: 'Invalid role' })

    // Ensure unique email and, if provided, unique phone
    const existsByEmail = await User.findOne({ email })
    if (existsByEmail) return res.status(409).json({ error: 'Email already registered' })
    let normalizedPhone = ''
    if (phone) {
      normalizedPhone = phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`
      const existsByPhone = await User.findOne({ phone: normalizedPhone })
      if (existsByPhone) return res.status(409).json({ error: 'Phone already registered' })
    }

    const passwordHash = await User.hashPassword(password)
    const user = await User.create({ name, email, phone: normalizedPhone || undefined, passwordHash, role, isEmailVerified: false })
    const token = signToken(user)
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Signup failed' })
  }
})

router.post('/login', async (req, res) => {
  try {
    let { email, phone, password } = req.body || {}
    email = typeof email === 'string' ? email.trim().toLowerCase() : ''
    phone = typeof phone === 'string' ? phone.trim() : ''
    if (!password) return res.status(400).json({ error: 'Missing credentials' })

    // Support login via email OR phone
    let user = null
    // If user typed a phone number into the email field, detect and normalize
    let inferredPhone = ''
    if (!phone && email) {
      const digitsFromEmail = (email || '').replace(/\D/g, '')
      if (/^\d{10}$/.test(digitsFromEmail)) {
        inferredPhone = `+91${digitsFromEmail}`
      } else if (/^\+?\d{10,15}$/.test(email)) {
        inferredPhone = email.startsWith('+') ? email : `+${email.replace(/\D/g, '')}`
      }
    }

    if (email) {
      user = await User.findOne({ email })
      try { console.log('[Auth/Login] lookup=email', { email, found: !!user }) } catch {}
      // If not found by email and we inferred a phone, try phone lookup as a fallback
      if (!user && inferredPhone) {
        const normalized = inferredPhone
        user = await User.findOne({ phone: normalized })
        try { console.log('[Auth/Login] fallback lookup=phoneFromEmail', { phone: normalized, found: !!user }) } catch {}
      }
    } else if (phone || inferredPhone) {
      // Normalize phone: ensure starts with +
      const src = phone || inferredPhone
      const normalized = src.startsWith('+') ? src : `+${src.replace(/\D/g, '')}`
      user = await User.findOne({ phone: normalized })
      try { console.log('[Auth/Login] lookup=phone', { phone: normalized, found: !!user }) } catch {}
    } else {
      return res.status(400).json({ error: 'Missing credentials' })
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    // Primary: bcrypt compare
    let ok = false
    try {
      ok = await user.comparePassword(password)
    } catch {}
    // Backward-compatible migrations
    const looksHashed = typeof user.passwordHash === 'string' && user.passwordHash.startsWith('$2')
    try { console.log('[Auth/Login] userFound', { id: String(user._id), hasPhone: !!user.phone, looksHashed, okInitial: ok }) } catch {}
    // Case 1: passwordHash is a plaintext string (old data)
    if (!ok && typeof user.passwordHash === 'string' && !looksHashed) {
      if (user.passwordHash === password) {
        try {
          user.passwordHash = await User.hashPassword(password)
          await user.save()
          ok = true
          try { console.log('[Auth/Login] migrated plaintext->bcrypt', { id: String(user._id) }) } catch {}
        } catch (e) { try { console.warn('[Auth/Login] migrate plaintext failed', { id: String(user._id), msg: e?.message }) } catch {} }
      }
    }
    // Case 2: legacy field 'password' present instead of 'passwordHash'
    if (!ok && typeof user.password === 'string') {
      if (user.password === password) {
        try {
          user.passwordHash = await User.hashPassword(password)
          user.password = undefined
          await user.save()
          ok = true
          try { console.log('[Auth/Login] migrated legacy password field', { id: String(user._id) }) } catch {}
        } catch (e) { try { console.warn('[Auth/Login] migrate legacy field failed', { id: String(user._id), msg: e?.message }) } catch {} }
      }
    }
    try { if (!ok) console.warn('[Auth/Login] invalid creds after checks', { id: String(user._id) }) } catch {}
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    const token = signToken(user)
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone } })
  } catch (err) {
    try { console.error('[Auth/Login] error', err?.message || err) } catch {}
    res.status(500).json({ error: 'Login failed' })
  }
})

// Unify OTP endpoints for both user and partner flows
router.post('/send-otp', sendOtp)
router.post('/verify-otp', verifyOtp)
router.post('/phone/send', sendOtp)
router.post('/phone/verify', verifyOtp)

// Password reset - request
router.post('/password/request', async (req, res) => {
  const { email } = req.body || {}
  const user = await User.findOne({ email })
  if (!user) return res.json({ ok: true })
  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30)
  await VerificationToken.create({ userId: user._id, type: 'password_reset', token, expiresAt })
  // TODO: send email with link `${APP_URL}/reset-password?token=${token}`
  res.json({ ok: true })
})

// Password reset - confirm
router.post('/password/reset', async (req, res) => {
  const { token, password } = req.body || {}
  const rec = await VerificationToken.findOne({ token, type: 'password_reset', consumedAt: null })
  if (!rec || rec.expiresAt < new Date()) return res.status(400).json({ error: 'Invalid token' })
  const user = await User.findById(rec.userId)
  if (!user) return res.status(400).json({ error: 'Invalid token' })
  user.passwordHash = await User.hashPassword(password)
  await user.save()
  rec.consumedAt = new Date()
  await rec.save()
  res.json({ ok: true })
})

// Email verification - request
router.post('/email/send', async (req, res) => {
  const { email } = req.body || {}
  const user = await User.findOne({ email })
  if (!user) return res.json({ ok: true })
  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24)
  await VerificationToken.create({ userId: user._id, type: 'email', token, expiresAt })
  // TODO: send email `${APP_URL}/verify-email?token=${token}`
  res.json({ ok: true })
})

// Removed duplicate legacy /phone/send and /phone/verify implementations.
// The controller-based endpoints above (sendOtp, verifyOtp) are the single source of truth.

// Email verification - confirm
router.post('/email/verify', async (req, res) => {
  const { token } = req.body || {}
  const rec = await VerificationToken.findOne({ token, type: 'email', consumedAt: null })
  if (!rec || rec.expiresAt < new Date()) return res.status(400).json({ error: 'Invalid token' })
  const user = await User.findById(rec.userId)
  if (!user) return res.status(400).json({ error: 'Invalid token' })
  user.isEmailVerified = true
  await user.save()
  rec.consumedAt = new Date()
  await rec.save()
  res.json({ ok: true })
})


export default router
