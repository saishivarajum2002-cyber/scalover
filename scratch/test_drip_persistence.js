const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { scheduleFollowUps, cancelFollowUps, getAllScheduled, processFollowUpDrip } = require('../services/followup');

const TEST_EMAIL = 'saishivaraju.m2002@gmail.com';
const TEST_PHONE = '+919999922222';

async function runTest() {
  console.log('🧪 Starting Email Drip Persistence Lifecycle Test...');

  // 1. Connect to MongoDB
  console.log('⏳ Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log('✅ MongoDB Connected.');

  // 2. Clear any existing test follow-ups
  console.log(`🧹 Cleaning previous test follow-ups for ${TEST_PHONE}...`);
  await cancelFollowUps(TEST_PHONE);

  // 3. Schedule Follow-Ups
  console.log(`🚀 Scheduling new follow-ups for ${TEST_EMAIL}...`);
  const lead = {
    phone: TEST_PHONE,
    name: 'Drip Test Lead',
    email: TEST_EMAIL,
    property_interest: 'Palm Villa Estate',
    budget: '$2.4M'
  };

  // Set up dummy property list
  const properties = [
    { id: 1, name: 'Palm Villa Estate', property_type: 'Villa', location: 'Palm Jumeirah', price_label: '$2,400,000', status: 'Available' }
  ];

  await scheduleFollowUps(lead, properties);
  console.log('✅ scheduleFollowUps complete.');

  // 4. Verify MongoDB persistence
  const FollowUpModel = mongoose.models.FollowUp;
  const entry = await FollowUpModel.findOne({ phone: TEST_PHONE });
  if (entry) {
    console.log(`✅ MongoDB Persistence Confirmed:`, {
      phone: entry.phone,
      email: entry.email,
      status: entry.status,
      last_sent_day: entry.last_sent_day,
      scheduled_at: entry.scheduled_at
    });
  } else {
    console.error('❌ Failed to find follow-up entry in MongoDB!');
  }

  // 5. Test Drip cron simulation
  console.log('⏳ Simulating 25 hours passing (to trigger Day 1 Drip)...');
  // Artificially backdate the scheduled_at timestamp by 25 hours
  if (entry) {
    entry.scheduled_at = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await entry.save();
    console.log(`🕒 Backdated scheduled_at to: ${entry.scheduled_at.toISOString()}`);
  }

  console.log('⏳ Processing follow-up drip sequence...');
  await processFollowUpDrip(properties);

  // Verify that last_sent_day has progressed to Day 1
  const updatedEntry = await FollowUpModel.findOne({ phone: TEST_PHONE });
  if (updatedEntry && updatedEntry.last_sent_day === 1) {
    console.log('✅ Day 1 Drip successfully processed & updated in MongoDB.');
  } else {
    console.error('❌ Day 1 Drip did not update correctly!', updatedEntry);
  }

  // 6. Test cancellation
  console.log(`🧹 Cancelling follow-ups for ${TEST_PHONE}...`);
  await cancelFollowUps(TEST_PHONE);
  const cancelledEntry = await FollowUpModel.findOne({ phone: TEST_PHONE });
  if (cancelledEntry && cancelledEntry.status === 'cancelled') {
    console.log('✅ Cancellation confirmed: status changed to cancelled.');
  } else {
    console.error('❌ Cancellation failed to update database status!');
  }

  await mongoose.connection.close();
  console.log('🔌 Connection closed. Test complete.');
}

runTest().catch(err => {
  console.error('❌ Test failed with error:', err);
  mongoose.connection.close();
});
