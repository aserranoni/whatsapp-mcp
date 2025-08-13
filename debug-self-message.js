#!/usr/bin/env node

import { WhatsAppClientWrapper } from './dist/whatsapp-client.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function debugSelfMessage() {
  try {
    console.log('🚀 Debugging self-message sending...');
    
    const config = {
      sessionName: 'whatsapp-mcp',
      qrCodeTimeout: 60000,
      authTimeoutMs: 30000,
      userDataDir: './whatsapp_session',
    };
    
    const client = new WhatsAppClientWrapper(config);
    console.log('📱 Initializing WhatsApp client...');
    
    await client.initialize();
    console.log('✅ WhatsApp client initialized successfully!');
    
    const status = client.getStatus();
    console.log('📊 Status:', JSON.stringify(status, null, 2));
    
    // Try different formats for self-messaging
    const phoneNumber = status.phoneNumber;
    const chatIds = [
      `${phoneNumber}@c.us`,      // Standard format
      `${phoneNumber}@s.whatsapp.net`, // Alternative format
      phoneNumber,                // Just the number
    ];
    
    for (const chatId of chatIds) {
      try {
        console.log(`\n🔍 Trying to send to: ${chatId}`);
        
        // First, try to get the chat to see if it exists
        try {
          const chat = await client.getChatById(chatId);
          console.log(`✅ Chat found: ${chat.name}, isGroup: ${chat.isGroup}, unreadCount: ${chat.unreadCount}`);
        } catch (chatError) {
          console.log(`❌ Chat not found: ${chatError.message}`);
          continue;
        }
        
        // Try to send message
        const message = `🤖 Test message ${Date.now()} - Testing self-message delivery with format: ${chatId}`;
        
        await client.sendTextMessage({
          chatId: chatId,
          text: message
        });
        
        console.log(`✅ Message sent successfully to ${chatId}!`);
        console.log(`📝 Message content: "${message}"`);
        
        // Wait a moment and try to verify
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.log(`❌ Failed to send to ${chatId}: ${error.message}`);
      }
    }
    
    await client.destroy();
    console.log('🔚 Client destroyed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

debugSelfMessage();