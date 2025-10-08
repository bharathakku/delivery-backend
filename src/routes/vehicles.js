import { Router } from 'express'
import { listVehicles } from '../controllers/vehicles.js'
import Vehicle from '../models/Vehicle.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// Public list (demo). Later, fetch from DB Vehicle collection
router.get('/', listVehicles)

// Admin: create vehicle type
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const v = await Vehicle.create(req.body)
  res.status(201).json(v)
})

// Public: list DB-defined vehicles
router.get('/db', async (req, res) => {
  const items = await Vehicle.find({ isActive: true })
  res.json(items)
})

export default router


