import { scanBuffer } from './lib/security/clamav';

async function testClamAV() {
  console.log('--- 🛡️ Starting ClamAV App-Side Verification ---');
  
  // 1. Test with a clean string
  const cleanBuffer = Buffer.from('This is a completely safe and clean file content.');
  console.log('1. Scanning clean buffer...');
  const isCleanSafe = await scanBuffer(cleanBuffer);
  console.log(`   Result: ${isCleanSafe ? '✅ SAFE' : '❌ INFECTED (Unexpected)'}`);

  // 2. Test with the EICAR test string (standard malware test string)
  // EICAR is a non-viral string that antivirus programs are designed to detect as a virus for testing purposes.
  const eicarString = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  const infectedBuffer = Buffer.from(eicarString);
  console.log('2. Scanning EICAR test buffer (Should be detected as infected)...');
  const isInfectedSafe = await scanBuffer(infectedBuffer);
  console.log(`   Result: ${isInfectedSafe ? '❌ SAFE (Scanner failed to detect)' : '✅ INFECTED (Correctly detected)'}`);

  if (isCleanSafe && !isInfectedSafe) {
    console.log('\n--- 🎊 Verification Successful! ---');
    console.log('ClamAV is correctly integrated and responding via Unix socket.');
  } else {
    console.log('\n--- ❌ Verification Failed ---');
    console.log('Check if clamav-daemon is running and the socket is accessible:');
    console.log('sudo systemctl status clamav-daemon');
  }
}

testClamAV().catch(console.error);
