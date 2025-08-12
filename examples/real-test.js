#!/usr/bin/env node

/**
 * Real WhatsApp MCP Server Test
 * 
 * This script will:
 * 1. Start the MCP server
 * 2. Initialize WhatsApp (you'll need to scan QR code)
 * 3. Send a test notification to your phone
 * 
 * Usage: node real-test.js [your_phone_number]
 * Example: node real-test.js 5511999999999@c.us
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function realWhatsAppTest() {
  console.log('🚀 WhatsApp MCP Server - Real Test\n');
  
  // Get phone number from user
  let chatId = process.argv[2];
  if (!chatId) {
    console.log('📱 For Brazilian numbers, use format: 5511XXXXXXXXX (55 = Brazil, 11 = São Paulo)');
    console.log('   Example: 5511987654321 for a São Paulo mobile number');
    chatId = await question('Enter your WhatsApp number (just digits): ');
  }
  
  if (!chatId.includes('@c.us') && !chatId.includes('@g.us')) {
    // Clean the number (remove any non-digits)
    const cleanNumber = chatId.replace(/\D/g, '');
    
    // Validate Brazilian number format
    if (cleanNumber.length === 13 && cleanNumber.startsWith('55')) {
      // Already has country code
      chatId = cleanNumber + '@c.us';
      console.log('✅ Using Brazilian number format');
    } else if (cleanNumber.length === 11 && cleanNumber.startsWith('11')) {
      // Add Brazil country code (55)
      chatId = '55' + cleanNumber + '@c.us';
      console.log('✅ Added Brazil country code (55)');
    } else if (cleanNumber.length === 9) {
      // Add São Paulo area code (11) and Brazil country code (55)
      chatId = '5511' + cleanNumber + '@c.us';
      console.log('✅ Added São Paulo area code (11) and Brazil country code (55)');
    } else {
      // Fallback: just add @c.us
      chatId = cleanNumber + '@c.us';
      console.log('⚠️  Using provided number as-is with @c.us suffix');
    }
  }
  
  console.log(`📱 Target chat: ${chatId}\n`);
  
  const serverPath = path.join(__dirname, 'dist', 'index.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let messageId = 1;
  
  // Forward server stderr to console
  server.stderr.on('data', (data) => {
    process.stderr.write(data);
  });
  
  // Store pending response handlers
  const responseHandlers = new Map();
  
  // Handle stdout - forward non-JSON output (like QR codes) to console
  server.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line.trim());
          // This is a JSON response, check if we have a handler for it
          const handler = responseHandlers.get(response.id);
          if (handler) {
            responseHandlers.delete(response.id);
            handler(response);
          }
        } catch (err) {
          // Not JSON, so it's probably console output (like QR code)
          // Forward it to the console
          console.log(line);
        }
      }
    }
  });
  
  function sendMessage(method, params = {}) {
    return new Promise((resolve, reject) => {
      const message = {
        jsonrpc: '2.0',
        id: messageId++,
        method,
        params
      };

      // Register handler for this message ID
      responseHandlers.set(message.id, resolve);
      
      server.stdin.write(JSON.stringify(message) + '\n');
      
      // Longer timeout for WhatsApp operations
      setTimeout(() => {
        if (responseHandlers.has(message.id)) {
          responseHandlers.delete(message.id);
          reject(new Error(`Timeout waiting for ${method}`));
        }
      }, 30000);
    });
  }

  try {
    console.log('1️⃣ Initializing MCP server...');
    await sendMessage('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'real-test', version: '1.0.0' }
    });
    console.log('✅ MCP server initialized\n');

    console.log('2️⃣ Initializing WhatsApp...');
    console.log('📱 A QR code will appear - scan it with your WhatsApp app');
    console.log('⏳ Waiting for authentication...\n');
    
    const initResult = await sendMessage('tools/call', {
      name: 'initialize_whatsapp',
      arguments: {
        sessionName: 'real-test-session',
        authTimeoutMs: 60000
      }
    });
    
    if (initResult.result?.content?.[0]?.text?.includes('successfully')) {
      console.log('✅ WhatsApp initialized successfully!\n');
      
      // Test 1: Send text message
      console.log('3️⃣ Sending test text message...');
      const textResult = await sendMessage('tools/call', {
        name: 'send_text_message',
        arguments: {
          chatId: chatId,
          text: '🤖 Hello from your WhatsApp MCP Server! This is a test message.'
        }
      });
      
      if (textResult.result?.content?.[0]?.text?.includes('successfully')) {
        console.log('✅ Text message sent!\n');
        
        // Test 2: Send task completion notification
        console.log('4️⃣ Sending task completion notification with audio...');
        const notificationResult = await sendMessage('tools/call', {
          name: 'send_task_completion_notification',
          arguments: {
            chatId: chatId,
            taskName: 'WhatsApp MCP Server Setup',
            summary: 'Successfully configured and tested the WhatsApp MCP server integration. Audio notifications are now working!',
            includeAudio: true
          }
        });
        
        if (notificationResult.result?.content?.[0]?.text?.includes('successfully')) {
          console.log('✅ Task completion notification sent!\n');
          console.log('🎉 All tests completed successfully!');
          console.log('📱 Check your WhatsApp for the messages');
        } else {
          console.log('⚠️  Notification may have had issues:', 
            notificationResult.result?.content?.[0]?.text);
        }
        
      } else {
        console.log('❌ Text message failed:', textResult.result?.content?.[0]?.text);
      }
      
    } else {
      console.log('❌ WhatsApp initialization failed:', 
        initResult.result?.content?.[0]?.text);
    }

  } catch (error) {
    console.error('❌ Test error:', error.message);
    if (error.message.includes('Timeout')) {
      console.log('\n💡 Tips:');
      console.log('   • Make sure to scan the QR code quickly');
      console.log('   • Check that your phone has internet connection');
      console.log('   • Try running the test again');
    }
  } finally {
    console.log('\n🔧 Cleaning up...');
    server.kill();
    rl.close();
  }
}

console.log('Press Ctrl+C to cancel at any time\n');
realWhatsAppTest().catch(console.error);