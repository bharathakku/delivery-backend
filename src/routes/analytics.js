import { Router } from 'express'
import Order from '../models/Order.js'
import Driver from '../models/Driver.js'
import Subscription from '../models/Subscription.js'
import User from '../models/User.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// Helper to sum adjusted or base price
function orderAmount(o) {
  const val = (typeof o.adjustedPrice === 'number' ? o.adjustedPrice : o.price)
  return Number(val || 0)
}

// Admin analytics dashboard
router.get('/dashboard', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    // Orders
    const orders = await Order.find().limit(2000)
    const delivered = orders.filter(o => String(o.status).toLowerCase() === 'delivered')
    const totalOrders = orders.length
    const deliveredCount = delivered.length
    const ordersRevenue = delivered.reduce((s, o) => s + orderAmount(o), 0)
    // Today's revenue (delivered today)
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0)
    const deliveredToday = delivered.filter(o => new Date(o.updatedAt || o.createdAt) >= startOfDay)
    const todayOrdersRevenue = deliveredToday.reduce((s, o) => s + orderAmount(o), 0)

    // Drivers online/active
    const activeDrivers = await Driver.countDocuments({ isOnline: true })

    // Customers count (basic)
    let activeCustomers = 0
    try {
      activeCustomers = await User.countDocuments({ role: 'customer' })
    } catch {}

    // Subscription revenue (approx): sum plan price for drivers with active, non-expired subscription
    const now = new Date()
    const driversWithPlans = await Driver.find({ subscriptionPlan: { $ne: null } }).select('subscriptionPlan subscriptionExpiry')
    const planNames = [...new Set(driversWithPlans.map(d => d.subscriptionPlan).filter(Boolean))]
    const plans = await Subscription.find({ name: { $in: planNames } }).select('name price')
    const priceMap = new Map(plans.map(p => [p.name, Number(p.price || 0)]))
    const subscriptionRevenue = driversWithPlans.reduce((s, d) => {
      const active = d.subscriptionExpiry ? (new Date(d.subscriptionExpiry) > now) : true
      if (!active) return s
      const price = priceMap.get(d.subscriptionPlan) || 0
      return s + price
    }, 0)
    const todaySubscriptionRevenue = 0 // No purchase records yet; keep 0 until we store subscription transactions

    // Driver earnings total (assume full adjusted price goes to driver for now)
    const driverEarningsTotal = ordersRevenue
    const todayDriverEarnings = todayOrdersRevenue

    res.json({
      totals: {
        totalOrders,
        deliveredCount,
        activeDrivers,
        activeCustomers,
      },
      revenue: {
        ordersRevenue,
        subscriptionRevenue,
        driverEarningsTotal,
        totalRevenue: subscriptionRevenue, // company revenue from subscriptions only (orders assumed passed to drivers)
        todayRevenue: todayOrdersRevenue + todaySubscriptionRevenue,
        todayOrdersRevenue,
        todaySubscriptionRevenue,
        todayDriverEarnings,
      }
    })
  } catch (e) {
    console.error('Analytics error', e)
    res.status(500).json({ error: 'Failed to compute analytics' })
  }
})

export default router
