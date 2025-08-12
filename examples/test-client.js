#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test the MCP server by sending JSON-RPC messages
async function testMcpServer() {
  console.log('🚀 Starting WhatsApp MCP server test...\n');
  
  const serverPath = path.join(__dirname, 'dist', 'index.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  let messageId = 1;

  // Helper to send JSON-RPC messages
  function sendMessage(method, params = {}) {
    return new Promise((resolve, reject) => {
      const message = {
        jsonrpc: '2.0',
        id: messageId++,
        method,
        params
      };

      const messageStr = JSON.stringify(message) + '\n';
      console.log(`📤 Sending: ${method}`);
      
      server.stdin.write(messageStr);

      // Listen for response
      const responseHandler = (data) => {
        try {
          const response = JSON.parse(data.toString().trim());
          if (response.id === message.id) {
            server.stdout.removeListener('data', responseHandler);
            resolve(response);
          }
        } catch (err) {
          // Might be partial data, ignore
        }
      };

      server.stdout.on('data', responseHandler);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        server.stdout.removeListener('data', responseHandler);
        reject(new Error(`Timeout waiting for response to ${method}`));
      }, 5000);
    });
  }

  try {
    // Test 1: Initialize the server
    console.log('1️⃣ Testing server initialization...');
    const initResponse = await sendMessage('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    console.log('✅ Server initialized:', initResponse.result ? 'Success' : 'Failed');

    // Test 2: List available tools
    console.log('\n2️⃣ Testing tools/list...');
    const toolsResponse = await sendMessage('tools/list', {});
    if (toolsResponse.result && toolsResponse.result.tools) {
      console.log('✅ Available tools:', toolsResponse.result.tools.length);
      toolsResponse.result.tools.forEach(tool => {
        console.log(`   • ${tool.name}: ${tool.description}`);
      });
    } else {
      console.log('❌ Failed to get tools list');
    }

    // Test 3: Get WhatsApp status (should fail since not initialized)
    console.log('\n3️⃣ Testing get_whatsapp_status...');
    const statusResponse = await sendMessage('tools/call', {
      name: 'get_whatsapp_status',
      arguments: {}
    });
    console.log('✅ WhatsApp status check completed');
    if (statusResponse.result && statusResponse.result.content) {
      console.log('   Status:', statusResponse.result.content[0].text);
    }

    console.log('\n🎉 Basic MCP server test completed successfully!');
    console.log('\nTo test WhatsApp integration:');
    console.log('1. Run: initialize_whatsapp');
    console.log('2. Scan QR code with your phone');
    console.log('3. Use send_task_completion_notification with your phone number');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    server.kill();
  }
}

// Run the test
testMcpServer().catch(console.error);