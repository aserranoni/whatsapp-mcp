#!/usr/bin/env node

import { WhatsAppClientWrapper } from '../dist/whatsapp-client.js';

async function testQRCode() {
  console.log('🚀 Testing WhatsApp QR Code Generation\n');
  
  try {
    const config = {
      sessionName: 'test-qr-session',
      qrCodeTimeout: 60000,
      authTimeoutMs: 60000,
      userDataDir: './whatsapp_session'
    };

    console.log('📱 Initializing WhatsApp client...');
    console.log('⏳ Please wait for the QR code to appear...\n');
    
    const client = new WhatsAppClientWrapper(config);
    
    // Initialize will trigger QR code display
    await client.initialize();
    
    console.log('\n✅ WhatsApp client initialized successfully!');
    console.log('📊 Status:', client.getStatus());
    
    // Clean up
    await client.destroy();
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('timed out')) {
      console.log('\n💡 The QR code should have appeared above.');
      console.log('   If you didn\'t see it, there might be an issue with the QR display.');
    }
  }
  
  process.exit(0);
}

console.log('This test will display a QR code if everything is working correctly.');
console.log('Press Ctrl+C to cancel at any time.\n');

testQRCode().catch(console.error);