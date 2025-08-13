#!/usr/bin/env node

import { WhatsAppClientWrapper } from './dist/whatsapp-client.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function initializeServer() {
  console.log('🚀 Initializing WhatsApp MCP Server\n');
  
  try {
    const config = {
      sessionName: process.env.WHATSAPP_SESSION_NAME || 'whatsapp-mcp-session',
      qrCodeTimeout: parseInt(process.env.WHATSAPP_AUTH_TIMEOUT_MS) || 120000,
      authTimeoutMs: parseInt(process.env.WHATSAPP_AUTH_TIMEOUT_MS) || 120000,
      userDataDir: process.env.WHATSAPP_USER_DATA_DIR || './whatsapp_session'
    };

    console.log('📱 Starting WhatsApp client initialization...');
    console.log('⏳ QR code will appear below. Scan it with your phone...\n');
    
    const client = new WhatsAppClientWrapper(config);
    
    // This will display the QR code and wait for authentication
    await client.initialize();
    
    console.log('\n✅ WhatsApp MCP server initialized successfully!');
    console.log('🔗 Your WhatsApp is now linked and ready to use with MCP tools');
    console.log('📊 Status:', client.getStatus());
    
    // Keep the connection alive for a few seconds to confirm
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Clean shutdown
    await client.destroy();
    
    console.log('\n🎉 Initialization complete! You can now use WhatsApp MCP tools.');
    
  } catch (error) {
    console.error('\n❌ Failed to initialize:', error.message);
    
    if (error.message.includes('timed out')) {
      console.log('\n💡 Tips:');
      console.log('   - Make sure you scanned the QR code within the timeout period');
      console.log('   - Check that your phone has internet connection');
      console.log('   - Try running this script again');
    }
    
    process.exit(1);
  }
}

console.log('🔧 This will initialize the WhatsApp MCP server with persistent authentication');
console.log('📱 Have your phone ready to scan the QR code\n');

initializeServer().catch(console.error);