import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'customer', 'partner', 'driver'], required: true },
    isEmailVerified: { type: Boolean, default: false },
    phone: { type: String },
    avatarUrl: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

UserSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.passwordHash)
}

UserSchema.statics.hashPassword = async function (password) {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export default mongoose.model('User', UserSchema)


