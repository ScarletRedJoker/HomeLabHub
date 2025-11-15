import { quotaService, Platform } from '../server/quota-service';

async function testQuotaService() {
  console.log('=== Testing Quota Service ===\n');

  console.log('1. Testing Twitch quota tracking...');
  for (let i = 0; i < 10; i++) {
    const status = await quotaService.trackApiCall('twitch', 1, 'test-user-1');
    console.log(`   Call ${i + 1}: ${status.current}/${status.limit} (${status.percentage.toFixed(1)}%) - Status: ${status.status}`);
  }

  console.log('\n2. Testing YouTube quota tracking...');
  for (let i = 0; i < 5; i++) {
    const status = await quotaService.trackApiCall('youtube', 100, 'test-user-1');
    console.log(`   Call ${i + 1}: ${status.current}/${status.limit} (${status.percentage.toFixed(1)}%) - Status: ${status.status}`);
  }

  console.log('\n3. Testing warning thresholds (Twitch)...');
  for (let i = 0; i < 700; i++) {
    await quotaService.trackApiCall('twitch', 1, 'test-user-2');
  }
  let status = await quotaService.trackApiCall('twitch', 1, 'test-user-2');
  console.log(`   At ${status.current}/${status.limit} (${status.percentage.toFixed(1)}%) - Status: ${status.status}`);
  console.log(`   Expected: WARNING (>70%)`);

  console.log('\n4. Testing alert threshold (Twitch)...');
  for (let i = 0; i < 100; i++) {
    await quotaService.trackApiCall('twitch', 1, 'test-user-3');
  }
  status = await quotaService.trackApiCall('twitch', 1, 'test-user-3');
  console.log(`   At ${status.current}/${status.limit} (${status.percentage.toFixed(1)}%) - Status: ${status.status}`);

  console.log('\n5. Testing circuit breaker (Twitch)...');
  for (let i = 0; i < 760; i++) {
    await quotaService.trackApiCall('twitch', 1, 'test-user-4');
  }
  status = await quotaService.trackApiCall('twitch', 1, 'test-user-4');
  console.log(`   At ${status.current}/${status.limit} (${status.percentage.toFixed(1)}%) - Status: ${status.status}`);
  console.log(`   Circuit Breaker Active: ${status.isCircuitBreakerActive}`);
  console.log(`   Expected: Circuit breaker should be active (>95%)`);

  console.log('\n6. Testing quota check...');
  const checkResult = await quotaService.checkQuota('twitch', 1, 'test-user-4');
  console.log(`   Allowed: ${checkResult.allowed}`);
  console.log(`   Reason: ${checkResult.reason || 'N/A'}`);

  console.log('\n7. Testing backoff delay...');
  const backoffDelay = quotaService.getBackoffDelayMs(status);
  console.log(`   Backoff delay: ${backoffDelay}ms`);

  console.log('\n8. Getting all quota status...');
  const allStatus = await quotaService.getAllQuotaStatus('test-user-1');
  for (const platformStatus of allStatus) {
    console.log(`   ${platformStatus.platform.toUpperCase()}: ${platformStatus.current}/${platformStatus.limit} (${platformStatus.percentage.toFixed(1)}%) - ${platformStatus.status}`);
  }

  console.log('\n9. Testing quota reset...');
  await quotaService.resetQuota('twitch', 'test-user-1');
  const afterReset = await quotaService.getAllQuotaStatus('test-user-1');
  const twitchAfterReset = afterReset.find(s => s.platform === 'twitch');
  console.log(`   Twitch after reset: ${twitchAfterReset?.current}/${twitchAfterReset?.limit}`);

  console.log('\n=== All Tests Complete ===');
  
  await quotaService.disconnect();
  process.exit(0);
}

testQuotaService().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
