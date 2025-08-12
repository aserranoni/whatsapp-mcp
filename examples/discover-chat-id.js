#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function discoverChatId() {
  console.log('🔍 WhatsApp Chat ID Discovery Tool\n');
  
  const serverPath = path.join(__dirname, 'dist', 'index.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let messageId = 1;
  const responseHandlers = new Map();
  
  // Forward server stderr to console
  server.stderr.on('data', (data) => {
    process.stderr.write(data);
  });
  
  // Handle stdout - forward non-JSON output (like QR codes) to console
  server.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line.trim());
          const handler = responseHandlers.get(response.id);
          if (handler) {
            responseHandlers.delete(response.id);
            handler(response);
          }
        } catch (err) {
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

      responseHandlers.set(message.id, resolve);
      server.stdin.write(JSON.stringify(message) + '\n');
      
      setTimeout(() => {
        if (responseHandlers.has(message.id)) {
          responseHandlers.delete(message.id);
          reject(new Error(`Timeout waiting for ${method}`));
        }
      }, 60000); // Longer timeout for auth
    });
  }

  try {
    console.log('1️⃣ Initializing MCP server...');
    await sendMessage('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'chat-id-discovery', version: '1.0.0' }
    });
    console.log('✅ MCP server initialized\n');

    console.log('2️⃣ Initializing WhatsApp...');
    console.log('📱 Scan the QR code that appears below:\n');
    
    const initResult = await sendMessage('tools/call', {
      name: 'initialize_whatsapp',
      arguments: {
        sessionName: 'chat-id-discovery',
        authTimeoutMs: 60000
      }
    });
    
    if (initResult.result?.content?.[0]?.text?.includes('successfully')) {
      console.log('\n✅ WhatsApp initialized successfully!\n');
      
      console.log('3️⃣ Getting your contacts...');
      const contactsResult = await sendMessage('tools/call', {
        name: 'list_contacts',
        arguments: {
          includeGroups: false
        }
      });
      
      if (contactsResult.result?.content?.[0]?.text) {
        const contacts = JSON.parse(contactsResult.result.content[0].text);
        
        console.log('\n📋 Your WhatsApp contacts:');
        console.log('==========================================');
        
        // Find contacts that might be your own number
        const yourContacts = contacts.filter(contact => 
          contact.id.includes('5511974949159') || 
          contact.pushname === 'You' ||
          contact.name?.toLowerCase().includes('você') ||
          contact.name?.toLowerCase().includes('you')
        );
        
        if (yourContacts.length > 0) {
          console.log('\n🎯 Possible matches for your number:');
          yourContacts.forEach((contact, index) => {
            console.log(`${index + 1}. Name: ${contact.name || contact.pushname || 'Unknown'}`);
            console.log(`   ID: ${contact.id}`);
            console.log(`   Number: ${contact.number || 'N/A'}`);
            console.log('');
          });
        }
        
        // Show first 10 contacts for reference
        console.log('\n📱 First 10 contacts (for reference):');
        contacts.slice(0, 10).forEach((contact, index) => {
          console.log(`${index + 1}. ${contact.name || contact.pushname || 'Unknown'}: ${contact.id}`);
        });
        
        console.log('\n💡 Tips:');
        console.log('• Look for your own name in the list above');
        console.log('• Your chat ID format is usually: [country][area][number]@c.us');
        console.log('• Try sending a message to yourself first in WhatsApp to create a chat');
        console.log(`• Total contacts found: ${contacts.length}`);
        
      } else {
        console.log('❌ Failed to get contacts');
      }
      
    } else {
      console.log('❌ WhatsApp initialization failed');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n🔧 Cleaning up...');
    server.kill();
  }
}

console.log('This tool will help you discover the correct chat ID for your WhatsApp number.');
console.log('Press Ctrl+C to cancel at any time.\n');

discoverChatId().catch(console.error);