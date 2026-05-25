const fetch = require('node-fetch');

async function testCronReminders() {
  console.log('🚀 Triggering Automated Same-Day & Next-Day Reminders Cron...');
  
  try {
    const res = await fetch('http://localhost:5000/api/cron/reminders', {
      method: 'GET',
      headers: {
        'x-api-secret': 'zorvo_secret_2026'
      }
    });

    const data = await res.json();
    console.log('Status Code:', res.status);
    console.log('Response Payload:', data);

    if (res.ok && data.success) {
      console.log('✅ CRON TEST PASSED: Reminders processed successfully!');
    } else {
      console.error('❌ CRON TEST FAILED:', data);
    }
  } catch (err) {
    console.error('❌ CRON TEST ERROR:', err.message);
  }
}

testCronReminders();
