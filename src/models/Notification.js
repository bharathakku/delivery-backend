import mongoose from 'mongoose'

const NotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    channel: { type: String, enum: ['email', 'sms', 'push', 'inapp'], default: 'inapp' },
    title: { type: String },
    body: { type: String },
    readAt: { type: Date },
    meta: { type: Object },
  },
  { timestamps: true }
)

export default mongoose.model('Notification', NotificationSchema)





