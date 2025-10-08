import { Router } from 'express'
import mongoose from 'mongoose'
import { requireAuth } from '../middleware/auth.js'
import Address from '../models/Address.js'
import { validate } from '../middleware/validate.js'
import Joi from 'joi'

const router = Router()

const addressCreateSchema = Joi.object({
  type: Joi.string().valid('home', 'work', 'other').default('other'),
  address: Joi.string().min(3).max(500).required(),
  landmark: Joi.string().allow('', null),
  coordinates: Joi.object({
    lat: Joi.number(),
    lng: Joi.number(),
  }).optional(),
  isDefault: Joi.boolean().default(false),
})

const addressUpdateSchema = Joi.object({
  type: Joi.string().valid('home', 'work', 'other'),
  address: Joi.string().min(3).max(500),
  landmark: Joi.string().allow('', null),
  coordinates: Joi.object({
    lat: Joi.number(),
    lng: Joi.number(),
  }).optional(),
  isDefault: Joi.boolean(),
})

// Get user's addresses
router.get('/', requireAuth, async (req, res) => {
  const items = await Address.find({ userId: req.user.id }).sort({ isDefault: -1, createdAt: -1 })
  res.json(items)
})

// Add new address
router.post('/', requireAuth, validate(addressCreateSchema), async (req, res) => {
  try {
    const { type, address, landmark, coordinates, isDefault } = req.body

    if (isDefault) {
      await Address.updateMany({ userId: req.user.id, isDefault: true }, { $set: { isDefault: false } })
    }

    const doc = await Address.create({
      userId: req.user.id,
      type,
      address,
      landmark,
      coordinates: coordinates ? { type: 'Point', coordinates: [coordinates.lng, coordinates.lat] } : undefined,
      isDefault,
    })
    res.status(201).json(doc)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to add address' })
  }
})

// Update address
router.put('/:id', requireAuth, validate(addressUpdateSchema), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    const { type, address, landmark, coordinates, isDefault } = req.body

    if (isDefault) {
      await Address.updateMany({ userId: req.user.id, isDefault: true }, { $set: { isDefault: false } })
    }

    const update = {
      ...(type && { type }),
      ...(address && { address }),
      ...(landmark !== undefined && { landmark }),
      ...(coordinates && { coordinates: { type: 'Point', coordinates: [coordinates.lng, coordinates.lat] } }),
      ...(isDefault !== undefined && { isDefault }),
    }

    const doc = await Address.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, update, { new: true })
    if (!doc) return res.status(404).json({ error: 'Address not found' })
    res.json(doc)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update address' })
  }
})

// Delete address
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    const doc = await Address.findOneAndDelete({ _id: req.params.id, userId: req.user.id })
    if (!doc) return res.status(404).json({ error: 'Address not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete address' })
  }
})

export default router
