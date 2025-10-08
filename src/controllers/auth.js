import crypto from 'crypto'
import User from '../models/User.js'
import VerificationToken from '../models/VerificationToken.js'
import jwt from 'jsonwebtoken'
import twilio from 'twilio'
import Driver from '../models/Driver.js'

function signToken(user) {
  const payload = { id: user._id.toString(), role: user.role, email: user.email, name: user.name }
  const secret = process.env.JWT_SECRET || 'dev_secret'
  const expiresIn = '7d'
  return jwt.sign(payload, secret, { expiresIn })
}

// Twilio credentials will be read per-request to ensure environment variables are available

// Unified sendOtp for both /send-otp and /phone/send
export const sendOtp = async (req, res) => {
  const { phone, role } = req.body
  if (!phone || !/^\+?\d{10,15}$/.test(phone)) return res.status(400).json({ error: 'Invalid phone' })
  const code = ('' + Math.floor(100000 + Math.random() * 900000))
  const token = crypto.randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 5)
  await VerificationToken.create({ type: 'phone', token, phone, code, expiresAt })

  // Read Twilio env at request time
  const twilioSid = (process.env.TWILIO_SID || '').trim()
  const twilioAuth = (process.env.TWILIO_AUTH_TOKEN || '').trim()
  const twilioNumber = (process.env.TWILIO_PHONE_NUMBER || '').trim()
  const messagingServiceSid = (process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim()
  const twilioClient = (twilioSid && twilioAuth) ? twilio(twilioSid, twilioAuth) : null

  // Determine if we can attempt SMS via Twilio (client plus either number or messaging service SID)
  const canSendSms = !!(twilioClient && (twilioNumber || messagingServiceSid))
  // Diagnostics to understand configuration in runtime (do not log secrets)
  try {
    console.log('[OTP] Twilio config:', {
      haveSid: !!twilioSid,
      haveAuth: !!twilioAuth,
      haveNumber: !!twilioNumber,
      haveMessagingServiceSid: !!messagingServiceSid,
      canSendSms,
    })
  } catch {}

  // If Twilio is configured, attempt to send SMS regardless of NODE_ENV
  if (canSendSms) {
    try {
      const msgParams = {
        body: `Your OTP is ${code}`,
        to: phone,
      }
      if (messagingServiceSid) {
        msgParams.messagingServiceSid = messagingServiceSid
        try { console.log('[OTP] Using Messaging Service SID for SMS') } catch {}
      } else if (twilioNumber) {
        msgParams.from = twilioNumber
        try { console.log('[OTP] Using From number for SMS') } catch {}
      }
      const msg = await twilioClient.messages.create(msgParams)
      return res.json({ ok: true, token, sent: true, provider: 'twilio', messageSid: msg?.sid })
    } catch (err) {
      console.error('Twilio SMS error:', {
        message: err?.message || String(err),
        code: err?.code,
        moreInfo: err?.moreInfo,
      })
      // Fall back to returning devCode to unblock testing if SMS fails
      return res.json({ ok: true, token, devCode: code, sent: false, provider: 'twilio' })
    }
  }

  // Twilio not configured: return devCode for convenience
  return res.json({ ok: true, token, devCode: code, sent: false, provider: 'dev' })
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