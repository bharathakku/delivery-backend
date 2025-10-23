import 'dotenv/config' // Load .env file
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

// Debug: Log environment variables
console.log('Current working directory:', process.cwd())
console.log('Razorpay environment variables:', {
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID ? 'Set' : 'Not set',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET ? 'Set' : 'Not set',
  NODE_ENV: process.env.NODE_ENV || 'development'
})

const app = express()

app.use(helmet())
app.use(express.json())
app.use(morgan('dev'))
app.use(cors({ origin: true, credentials: true }))

const vehicles = [
  {
    id: 'two-wheeler',
    type: 'Two Wheeler',
    subtitle: 'Fast & Light',
    capacity: 'Up to 50 kg',
    description: 'Ideal for documents and small parcels',
    price: 150,
    originalPrice: 180,
    image: 'https://img.icons8.com/color/96/scooter.png',
    available: true,
    estimatedTime: '6-10 mins'
  },
  {
    id: 'three-wheeler',
    type: 'Three Wheeler',
    subtitle: 'Mid-size Deliveries',
    capacity: 'Up to 500 kg',
    description: 'Perfect for medium loads and local deliveries',
    price: 250,
    originalPrice: 280,
    image: 'https://cdn-icons-png.flaticon.com/512/6179/6179815.png',
    available: true,
    estimatedTime: '10-15 mins'
  },
  {
    id: 'heavy-truck',
    type: 'Heavy Truck',
    subtitle: 'Heavy Duty Truck',
    capacity: 'Up to 1000 kg',
    description: 'Ideal for furniture, appliances & bulk items',
    price: 495,
    originalPrice: 520,
    image: 'https://cdn-icons-png.flaticon.com/512/870/870130.png',
    available: true,
    estimatedTime: '12-18 mins'
  }
]

app.get('/vehicles', (req, res) => {
  res.json(vehicles)
})

app.post('/orders/quote', (req, res) => {
  const { vehicleId, distanceKm = 5 } = req.body || {}
  const v = vehicles.find(x => x.id === vehicleId)
  if (!v) return res.status(400).json({ error: 'Invalid vehicle' })
  const base = v.price
  const perKm = Math.max(10, Math.round(v.price * 0.05))
  const total = base + perKm * Math.max(0, distanceKm - 2)
  res.json({ vehicleId, distanceKm, base, perKm, total })
})

app.get('/healthz', (req, res) => res.json({ ok: true }))

const port = process.env.PORT || 4000
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`)
})


