import crypto from 'crypto'
import User from '../models/User.js'
import VerificationToken from '../models/VerificationToken.js'
import jwt from 'jsonwebtoken'
import Driver from '../models/Driver.js'

function signToken(user) {
  const payload = { id: user._id.toString(), role: user.role, email: user.email, name: user.name }
  const secret = process.env.JWT_SECRET || 'dev_secret'
  const expiresIn = '7d'
  return jwt.sign(payload, secret, { expiresIn })
}

// Unified sendOtp for both /send-otp and /phone/send
export const sendOtp = async (req, res) => {
  const { phone, role, mode } = req.body
  if (!phone || !/^\+?\d{10,15}$/.test(phone)) return res.status(400).json({ error: 'Invalid phone' })
  // Enforce existence rules based on mode for driver flow
  try {
    const normalizedRole = (role === 'partner' ? 'driver' : role) || 'customer'
    const userForPhone = await User.findOne({ phone, role: normalizedRole })
    if ((mode === 'login' || mode === 'signin') && normalizedRole === 'driver') {
      if (!userForPhone) {
        return res.status(404).json({ error: 'No partner account found for this number. Please sign up.' })
      }
    }
    if ((mode === 'signup' || mode === 'register') && normalizedRole === 'driver') {
      if (userForPhone) {
        return res.status(409).json({ error: 'Partner account already exists. Please log in.' })
      }
    }
  } catch (e) {
    try { console.warn('[sendOtp] existence check warning:', e?.message || String(e)) } catch {}
  }
  const code = ('' + Math.floor(100000 + Math.random() * 900000))
  const token = crypto.randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 5)
  await VerificationToken.create({ type: 'phone', token, phone, code, expiresAt })

  // Always return code on response for on-screen verification flow (no SMS provider)
  return res.json({ ok: true, token, devCode: code, sent: false, provider: 'onscreen' })
}

// Unified verifyOtp for both /verify-otp and /phone/verify
export const verifyOtp = async (req, res) => {
  const { token, code, role, name } = req.body
  const rec = await VerificationToken.findOne({ token, type: 'phone', consumedAt: null })
  if (!rec || rec.expiresAt < new Date()) return res.status(400).json({ error: 'Invalid token' })
  if (rec.code !== code) return res.status(400).json({ error: 'Invalid code' })

  // Create/find a separate user per role for the same phone (no role upgrade)
  const requestedRole = (role === 'partner' ? 'driver' : role) || 'customer'
  let user = await User.findOne({ phone: rec.phone, role: requestedRole })

  if (!user) {
    // Email must be unique per user. Use role tag to avoid conflicts between roles for same phone
    const roleTag = requestedRole || 'customer'
    const email = `${rec.phone}+${roleTag}@phone.login`
    user = await User.create({
      name: (typeof name === 'string' && name.trim()) ? name.trim() : `User ${rec.phone}`,
      email,
      passwordHash: await User.hashPassword(crypto.randomBytes(8).toString('hex')),
      role: requestedRole,
      phone: rec.phone,
      isEmailVerified: false,
    })
  }
  else if (typeof name === 'string' && name.trim()) {
    // If user exists and provided a name, update when current name is a default placeholder
    const provided = name.trim()
    if (user.name === `User ${rec.phone}` || /^\+?\d+.*@phone\.login$/i.test(user.email)) {
      user.name = provided
      await user.save()
    }
  }

  // Ensure Driver profile exists for driver role users
  if (requestedRole === 'driver') {
    const existingDriver = await Driver.findOne({ userId: user._id })
    if (!existingDriver) {
      await Driver.create({ userId: user._id })
    }
  }

  const jwtToken = signToken(user)
  res.json({ token: jwtToken, user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone } })
}