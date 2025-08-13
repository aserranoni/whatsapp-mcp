#!/usr/bin/env node

import { WhatsAppClientWrapper } from './dist/whatsapp-client.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function sendFinalTest() {
  try {
    const config = {
      sessionName: 'whatsapp-mcp',
      qrCodeTimeout: 60000,
      authTimeoutMs: 30000,
      userDataDir: './whatsapp_session',
    };
    
    const client = new WhatsAppClientWrapper(config);
    await client.initialize();
    
    const now = new Date();
    const timestamp = now.toLocaleString('pt-BR');
    
    const message = `🚨 CLAUDE CODE TEST MESSAGE 🚨
    
Sent at: ${timestamp}
From: WhatsApp MCP Server
Status: ✅ WORKING

If you see this message, the WhatsApp MCP integration is working perfectly!

Time: ${now.getTime()}`;
    
    console.log('🎯 Sending final test message...');
    console.log('📝 Message:', message);
    
    await client.sendTextMessage({
      chatId: '5511974949159@c.us',
      text: message
    });
    
    console.log('✅ Final test message sent!');
    console.log('🔍 Please check:');
    console.log('   1. Your WhatsApp chat list for a chat with yourself');
    console.log('   2. Look for "Eu" or your own number in the chats');
    console.log('   3. Check if there are any notifications');
    
    await client.destroy();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

sendFinalTest();