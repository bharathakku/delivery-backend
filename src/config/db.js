import mongoose from 'mongoose'

export async function initDb() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/yourdelivery'
  mongoose.set('strictQuery', true)
  await mongoose.connect(mongoUri, {
    autoIndex: true,
  })
  console.log('Connected to MongoDB')
}


