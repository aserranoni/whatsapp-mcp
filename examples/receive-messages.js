#!/usr/bin/env node

/**
 * WhatsApp Message Receiving Example
 * 
 * This example demonstrates how to use the WhatsApp MCP server to receive and process
 * incoming messages using the message receiving capabilities.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WhatsAppMessageReceiver {
  constructor() {
    this.mcpProcess = null;
    this.isConnected = false;
  }

  async start() {
    console.log('🚀 Starting WhatsApp MCP Server for message receiving...\n');

    // Start the MCP server
    const serverPath = path.join(__dirname, '..', 'dist', 'index.js');
    this.mcpProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    // Handle server output
    this.mcpProcess.stdout.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        this.handleServerResponse(response);
      } catch (error) {
        // Might be server logs, just display them
        console.log('Server:', data.toString());
      }
    });

    // Initialize WhatsApp client
    await this.initializeWhatsApp();
    
    // Set up message receiving
    await this.setupMessageReceiving();
    
    // Start monitoring messages
    await this.startMessageMonitoring();

    console.log('✅ WhatsApp message receiver is now active!');
    console.log('📱 Scan the QR code with your WhatsApp mobile app to start receiving messages.\n');
  }

  async sendCommand(method, params = {}) {
    if (!this.mcpProcess) {
      throw new Error('MCP server not started');
    }

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: method,
        arguments: params
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 30000);

      const handleResponse = (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === request.id) {
            clearTimeout(timeout);
            this.mcpProcess.stdout.removeListener('data', handleResponse);
            
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          }
        } catch (error) {
          // Ignore parsing errors, might be other data
        }
      };

      this.mcpProcess.stdout.on('data', handleResponse);
      this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async initializeWhatsApp() {
    try {
      console.log('🔄 Initializing WhatsApp client...');
      const result = await this.sendCommand('initialize_whatsapp', {
        sessionName: 'message-receiver-session',
        authTimeoutMs: 120000
      });
      
      console.log('✅ WhatsApp client initialized successfully');
      this.isConnected = true;
    } catch (error) {
      console.error('❌ Failed to initialize WhatsApp:', error.message);
      throw error;
    }
  }

  async setupMessageReceiving() {
    try {
      console.log('🔄 Setting up message receiving...');
      
      // Subscribe to all message types
      const subscription = await this.sendCommand('subscribe_to_messages', {
        messageTypes: ['text', 'media', 'group'],
        callback: null // We'll poll for messages instead of using webhooks in this example
      });
      
      console.log('✅ Message receiving configured');
      console.log('📋 Subscription ID:', subscription.content[0].text);
    } catch (error) {
      console.error('❌ Failed to setup message receiving:', error.message);
      throw error;
    }
  }

  async startMessageMonitoring() {
    console.log('👁️  Starting message monitoring...\n');
    
    // Poll for new messages every 5 seconds
    setInterval(async () => {
      try {
        await this.checkForNewMessages();
      } catch (error) {
        console.error('Error checking messages:', error.message);
      }
    }, 5000);

    // Also check for unread messages periodically
    setInterval(async () => {
      try {
        await this.processUnreadMessages();
      } catch (error) {
        console.error('Error processing unread messages:', error.message);
      }
    }, 15000);
  }

  async checkForNewMessages() {
    try {
      const result = await this.sendCommand('get_recent_messages', {
        limit: 5,
        onlyUnread: true,
        includeMedia: true
      });

      const data = JSON.parse(result.content[0].text);
      
      if (data.count > 0) {
        console.log(`📨 Found ${data.count} new messages:`);
        
        data.messages.forEach((message, index) => {
          console.log(`\n${index + 1}. Message from: ${this.formatSender(message)}`);
          console.log(`   💬 Content: ${message.body || '[Media message]'}`);
          console.log(`   🕐 Time: ${new Date(message.timestamp).toLocaleString()}`);
          console.log(`   📱 Type: ${message.type}`);
          
          if (message.isGroup) {
            console.log(`   👥 Group: ${message.from}`);
            console.log(`   👤 Author: ${message.author}`);
          }
          
          if (message.hasMedia) {
            console.log(`   📎 Media: ${message.type}`);
          }
          
          if (message.mentions && message.mentions.length > 0) {
            console.log(`   @️⃣ Mentions: ${message.mentions.length} people`);
          }
        });

        // Demonstrate auto-reply to text messages
        await this.handleAutoReplies(data.messages);
      }
    } catch (error) {
      // Silently handle errors during polling to avoid spam
      if (error.message !== 'Request timeout') {
        console.error('Error checking recent messages:', error.message);
      }
    }
  }

  async processUnreadMessages() {
    try {
      const result = await this.sendCommand('get_unread_messages', {
        markAsRead: false // Don't mark as read automatically
      });

      const data = JSON.parse(result.content[0].text);
      
      if (data.count > 0) {
        console.log(`\n📬 You have ${data.count} unread messages total`);
      }
    } catch (error) {
      // Silently handle errors
    }
  }

  async handleAutoReplies(messages) {
    for (const message of messages) {
      // Simple auto-reply logic
      if (message.type === 'text' && message.body) {
        const text = message.body.toLowerCase();
        
        if (text.includes('hello') || text.includes('hi')) {
          await this.sendAutoReply(message.id, "Hello! Thanks for your message. This is an automated response from the WhatsApp MCP server example. 👋");
        } else if (text.includes('help')) {
          await this.sendAutoReply(message.id, "This is a demonstration of WhatsApp message receiving using the MCP server. You can send any message and I'll receive it! 🤖");
        } else if (text.includes('time')) {
          await this.sendAutoReply(message.id, `The current time is: ${new Date().toLocaleString()} ⏰`);
        }
      }
    }
  }

  async sendAutoReply(messageId, replyText) {
    try {
      await this.sendCommand('reply_to_message', {
        messageId: messageId,
        text: replyText,
        mentionAuthor: true
      });
      
      console.log(`   ↩️  Auto-replied to message ${messageId}`);
    } catch (error) {
      console.error('Failed to send auto-reply:', error.message);
    }
  }

  formatSender(message) {
    if (message.isGroup) {
      return `${message.author} (in group ${message.from})`;
    } else {
      return message.from;
    }
  }

  handleServerResponse(response) {
    if (response.result && response.result.content) {
      // Handle server responses here if needed
    }
  }

  async stop() {
    console.log('\n🛑 Stopping WhatsApp message receiver...');
    
    if (this.mcpProcess) {
      this.mcpProcess.kill();
    }
    
    console.log('✅ Message receiver stopped');
  }
}

// Example usage
async function runExample() {
  const receiver = new WhatsAppMessageReceiver();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Received shutdown signal...');
    await receiver.stop();
    process.exit(0);
  });

  try {
    await receiver.start();
    
    // Keep the process running
    console.log('💡 Tips:');
    console.log('  - Send "hello" to get a greeting response');
    console.log('  - Send "help" to get help information');
    console.log('  - Send "time" to get the current time');
    console.log('  - Press Ctrl+C to stop the receiver\n');
    
    // Demonstrate some message operations after a delay
    setTimeout(async () => {
      try {
        console.log('\n🔍 Demonstrating message search...');
        const searchResult = await receiver.sendCommand('search_messages', {
          query: 'hello',
          limit: 3
        });
        
        const searchData = JSON.parse(searchResult.content[0].text);
        console.log(`Found ${searchData.count} messages containing "hello"`);
        
      } catch (error) {
        console.error('Search demonstration failed:', error.message);
      }
    }, 30000); // After 30 seconds

  } catch (error) {
    console.error('❌ Failed to start message receiver:', error.message);
    process.exit(1);
  }
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExample().catch(console.error);
}

export { WhatsAppMessageReceiver };