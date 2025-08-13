#!/usr/bin/env node

import { WhatsAppClientWrapper } from './dist/whatsapp-client.js';
import { isAuthError, logAuthError } from './dist/auth/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function sendTestMessage() {
  try {
    console.log('🚀 Initializing WhatsApp client for message sending...');
    
    const config = {
      sessionName: 'whatsapp-mcp',
      qrCodeTimeout: 60000,
      authTimeoutMs: 30000,
      userDataDir: './whatsapp_session',
    };
    
    const client = new WhatsAppClientWrapper(config);
    console.log('📱 Initializing WhatsApp client...');
    console.log(`🔐 Recommended auth strategy: ${await client.getRecommendedAuthStrategy()}`);
    console.log(`🛡️  Available auth strategies: ${client.getAuthStrategies().join(', ')}`);
    
    await client.initialize();
    console.log('✅ WhatsApp client initialized successfully!');
    
    const status = client.getStatus();
    console.log('📊 Status:', JSON.stringify(status, null, 2));
    
    const authInfo = client.getAuthStateInfo();
    console.log(`🔍 Auth State: ${authInfo.state} - ${authInfo.message || 'No message'}`);
    
    const authHistory = client.getAuthHistory();
    console.log(`📜 Auth History: ${authHistory.length} transitions`);
    
    if (status.isConnected && status.phoneNumber) {
      const chatId = `${status.phoneNumber}@c.us`;
      const message = "Hello from Claude! 🤖 This is a test message sent directly from the WhatsApp MCP server. The Chrome configuration issue has been resolved and everything is working perfectly!";
      
      console.log(`📨 Sending test message to ${chatId}...`);
      
      await client.sendTextMessage({
        chatId: chatId,
        text: message
      });
      
      console.log('✅ Test message sent successfully!');
    } else {
      console.log('❌ WhatsApp client not properly connected');
    }
    
    await client.destroy();
    console.log('🔚 Client destroyed');
    
  } catch (error) {
    if (isAuthError(error)) {
      logAuthError(error, 'SendTestMessage');
    } else {
      console.error('❌ Unexpected Error:', error.message);
    }
  }
}

sendTestMessage();