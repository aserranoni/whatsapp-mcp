#!/usr/bin/env node

import { WhatsAppClientWrapper } from './dist/whatsapp-client.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('Environment variables:');
console.log('PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);
console.log('PUPPETEER_CACHE_DIR:', process.env.PUPPETEER_CACHE_DIR);

async function testWhatsApp() {
  try {
    console.log('Testing WhatsApp client initialization...');
    
    const config = {
      sessionName: 'whatsapp-mcp',
      qrCodeTimeout: 60000,
      authTimeoutMs: 30000,
      userDataDir: './whatsapp_session',
    };
    
    const client = new WhatsAppClientWrapper(config);
    console.log('Client created, initializing...');
    
    await client.initialize();
    console.log('✅ WhatsApp client initialized successfully!');
    
    const status = client.getStatus();
    console.log('Status:', JSON.stringify(status, null, 2));
    
    await client.destroy();
    console.log('Client destroyed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testWhatsApp();