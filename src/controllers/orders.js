const demoVehicles = {
  'two-wheeler': { base: 150 },
  'three-wheeler': { base: 250 },
  'heavy-truck': { base: 495 },
}

export function quoteOrder(req, res) {
  const { vehicleId, distanceKm = 5 } = req.body || {}
  const v = demoVehicles[vehicleId]
  if (!v) return res.status(400).json({ error: 'Invalid vehicle' })
  const base = v.base
  const perKm = Math.max(10, Math.round(base * 0.05))
  const total = base + perKm * Math.max(0, Number(distanceKm) - 2)
  res.json({ vehicleId, distanceKm: Number(distanceKm), base, perKm, total })
}


