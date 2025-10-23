import mongoose from 'mongoose';
import Driver from './src/models/Driver.js';
import User from './src/models/User.js';
import dotenv from 'dotenv';

async function fixDriverProfile() {
  try {
    // Load environment variables
    dotenv.config();
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find the user
    const user = await User.findOne({ email: 'bharathanandh7@gmail.com' });
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('👤 Found user:', user._id);

    // Check if driver profile exists
    let driver = await Driver.findOne({ userId: user._id });
    
    if (!driver) {
      console.log('ℹ️ No driver profile found, creating one...');
      driver = new Driver({
        userId: user._id,
        fullName: user.name,
        email: user.email,
        phone: user.phone,
        isActive: true,
        isOnline: true,
        vehicleType: 'two-wheeler',
        // Add default values for required fields
        aadharNumber: '123456789012', // This should be updated with real data
        panNumber: 'ABCDE1234F',      // This should be updated with real data
        drivingLicense: 'DL12345678901234', // This should be updated with real data
        vehicleNumber: 'TN01AB1234',  // This should be updated with real data
        documents: [
          {
            type: 'aadhar',
            url: 'https://example.com/aadhar.jpg',
            status: 'approved'
          },
          {
            type: 'pan',
            url: 'https://example.com/pan.jpg',
            status: 'approved'
          },
          {
            type: 'driving_license',
            url: 'https://example.com/dl.jpg',
            status: 'approved'
          }
        ]
      });
      await driver.save();
      console.log('✅ Created new driver profile');
    } else {
      // Update existing driver profile
      console.log('ℹ️ Updating existing driver profile...');
      driver.isActive = true;
      driver.isOnline = true;
      // Ensure all required fields have values
      if (!driver.vehicleType) driver.vehicleType = 'two-wheeler';
      if (!driver.aadharNumber) driver.aadharNumber = '123456789012';
      if (!driver.panNumber) driver.panNumber = 'ABCDE1234F';
      if (!driver.drivingLicense) driver.drivingLicense = 'DL12345678901234';
      if (!driver.vehicleNumber) driver.vehicleNumber = 'TN01AB1234';
      
      await driver.save();
      console.log('✅ Updated existing driver profile');
    }

    console.log('🎉 Driver profile is now active and ready to use!');
    console.log('Please update the document URLs and other details with real data as soon as possible.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixDriverProfile();
