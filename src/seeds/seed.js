import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import { initDb } from '../config/db.js'
import User from '../models/User.js'
import Driver from '../models/Driver.js'
import Vehicle from '../models/Vehicle.js'
import Order from '../models/Order.js'
import Subscription from '../models/Subscription.js'

async function upsertUser({ name, email, role, password }) {
  let user = await User.findOne({ email })
  if (!user) {
    const passwordHash = await User.hashPassword(password)
    user = await User.create({ name, email, role, passwordHash, isEmailVerified: true })
    console.log(`Created user ${email}`)
  } else {
    console.log(`Found user ${email}`)
  }
  return user
}

async function run() {
  await initDb()

  // Users
  const admin = await upsertUser({ name: 'Admin', email: 'admin@example.com', role: 'admin', password: 'Passw0rd!' })
  const customer = await upsertUser({ name: 'Alice', email: 'alice@example.com', role: 'customer', password: 'Passw0rd!' })
  const driverUser = await upsertUser({ name: 'Driver Dan', email: 'driver@example.com', role: 'driver', password: 'Passw0rd!' })

  // No separate Partner model; company metadata lives on Driver

  // Vehicle types
  const vData = [
    { type: 'two-wheeler', title: 'Two Wheeler', capacityKg: 50, basePrice: 150, perKmPrice: 10, imageUrl: 'https://img.icons8.com/color/96/scooter.png' },
    { type: 'three-wheeler', title: 'Three Wheeler', capacityKg: 500, basePrice: 250, perKmPrice: 15 },
    { type: 'heavy-truck', title: 'Heavy Truck', capacityKg: 1000, basePrice: 495, perKmPrice: 25 },
  ]
  for (const vd of vData) {
    const exists = await Vehicle.findOne({ type: vd.type })
    if (!exists) await Vehicle.create(vd)
  }
  console.log('Seeded vehicles')

  // Driver profile (online, with location)
  let driver = await Driver.findOne({ userId: driverUser._id })
  if (!driver) {
    driver = await Driver.create({ userId: driverUser._id, companyName: 'Driver Co', isOnline: true, location: { type: 'Point', coordinates: [80.21, 13.06] }, capacityKg: 100 })
    console.log('Created driver')
  }

  // Subscription plans
  const plans = [
    { name: 'Starter', description: 'Up to 5 active orders', price: 0, durationDays: 30, restrictions: { maxActiveOrders: 5, prioritySupport: false } },
    { name: 'Pro', description: 'Up to 25 active orders', price: 999, durationDays: 30, restrictions: { maxActiveOrders: 25, prioritySupport: true } },
    { name: 'Business', description: 'Unlimited active orders', price: 2499, durationDays: 30, restrictions: { maxActiveOrders: 1000000, prioritySupport: true } },
  ]
  for (const p of plans) {
    const existing = await Subscription.findOne({ name: p.name })
    if (!existing) await Subscription.create(p)
  }
  console.log('Seeded subscriptions')

  // Sample order for customer
  const existingOrder = await Order.findOne({ customerId: customer._id })
  if (!existingOrder) {
    await Order.create({
      customerId: customer._id,
      vehicleType: 'two-wheeler',
      from: { address: 'A', location: { type: 'Point', coordinates: [80.2, 13.05] } },
      to: { address: 'B', location: { type: 'Point', coordinates: [80.3, 13.07] } },
      distanceKm: 5,
      price: 200,
      statusHistory: [{ status: 'created', by: customer._id.toString() }],
    })
    console.log('Created sample order')
  }

  await mongoose.connection.close()
  console.log('Seed completed')
}

run().catch((e) => { console.error(e); process.exit(1) })


