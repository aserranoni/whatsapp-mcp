#!/usr/bin/env node

/**
 * WhatsApp Auto-Responder Example
 * 
 * This example demonstrates how to create an intelligent auto-responder using
 * the WhatsApp MCP server. It shows pattern matching, context awareness,
 * and different response strategies.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WhatsAppAutoResponder {
  constructor() {
    this.mcpProcess = null;
    this.isActive = false;
    this.responseRules = this.initializeResponseRules();
    this.conversationContext = new Map();
    this.processedMessages = new Set();
  }

  initializeResponseRules() {
    return [
      {
        name: 'greeting',
        patterns: [/\b(hello|hi|hey|good morning|good afternoon|good evening)\b/i],
        responses: [
          "Hello! 👋 Thanks for reaching out. How can I help you today?",
          "Hi there! 😊 What can I do for you?",
          "Hey! Good to hear from you. What's on your mind?"
        ],
        cooldown: 300000, // 5 minutes
        mentionAuthor: true
      },
      {
        name: 'help',
        patterns: [/\b(help|support|assist|guide)\b/i],
        responses: [
          "I'm here to help! 🤖 You can ask me about:\n• General questions\n• Time and date\n• Simple calculations\n• Or just chat with me!",
          "Need assistance? I can help with various topics. Just ask me anything! 💭"
        ],
        mentionAuthor: true
      },
      {
        name: 'time',
        patterns: [/\b(time|what time|current time|clock)\b/i],
        responses: () => [`The current time is: ${new Date().toLocaleString()} ⏰`],
        mentionAuthor: true
      },
      {
        name: 'date',
        patterns: [/\b(date|today|what day|current date)\b/i],
        responses: () => [`Today is: ${new Date().toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })} 📅`],
        mentionAuthor: true
      },
      {
        name: 'calculation',
        patterns: [/(\d+)\s*([\+\-\*\/])\s*(\d+)/],
        responses: (match) => {
          const num1 = parseInt(match[1]);
          const operator = match[2];
          const num2 = parseInt(match[3]);
          let result;
          
          switch (operator) {
            case '+': result = num1 + num2; break;
            case '-': result = num1 - num2; break;
            case '*': result = num1 * num2; break;
            case '/': result = num2 !== 0 ? num1 / num2 : 'Cannot divide by zero'; break;
            default: return ['I can help with basic math operations! 📊'];
          }
          
          return [`${num1} ${operator} ${num2} = ${result} 🧮`];
        },
        mentionAuthor: false
      },
      {
        name: 'thank_you',
        patterns: [/\b(thank|thanks|thx|appreciate)\b/i],
        responses: [
          "You're welcome! 😊",
          "Happy to help! 🤝",
          "No problem at all! 👍",
          "Glad I could assist! ✨"
        ],
        mentionAuthor: false,
        cooldown: 180000 // 3 minutes
      },
      {
        name: 'goodbye',
        patterns: [/\b(bye|goodbye|see you|talk later|gtg|gotta go)\b/i],
        responses: [
          "Goodbye! Have a great day! 👋",
          "See you later! Take care! 🌟",
          "Until next time! 😊"
        ],
        mentionAuthor: true,
        finalizes: true
      },
      {
        name: 'weather',
        patterns: [/\b(weather|temperature|forecast|rain|sunny|cloudy)\b/i],
        responses: [
          "I'd love to help with weather info! 🌤️ Unfortunately, I don't have access to weather APIs in this demo, but you could integrate one!",
          "Weather questions are great! ☀️ This auto-responder could be connected to weather services for real forecasts."
        ],
        mentionAuthor: true
      },
      {
        name: 'default',
        patterns: [/.*/], // Matches everything as fallback
        responses: [
          "I received your message! 📨 While I have basic auto-responses, you might want to ask about time, date, or say hello!",
          "Thanks for your message! 🤖 I'm a simple auto-responder demo. Try asking for help to see what I can do!",
          "Message received! ✅ This is an automated response. For more features, check out the WhatsApp MCP server documentation!"
        ],
        probability: 0.3, // Only respond 30% of the time to avoid spam
        mentionAuthor: false,
        cooldown: 600000 // 10 minutes
      }
    ];
  }

  async start() {
    console.log('🤖 Starting WhatsApp Auto-Responder...\n');

    // Start the MCP server
    const serverPath = path.join(__dirname, '..', 'dist', 'index.js');
    this.mcpProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    // Handle server output
    this.mcpProcess.stdout.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        // Handle responses if needed
      } catch (error) {
        console.log('Server:', data.toString());
      }
    });

    // Initialize WhatsApp client
    await this.initializeWhatsApp();
    
    // Configure auto-response system
    await this.configureAutoResponse();
    
    // Start monitoring
    await this.startAutoResponding();

    console.log('✅ Auto-responder is now active!');
    console.log('📱 Scan QR code to start auto-responding to messages.\n');
    
    this.displayRules();
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
          // Ignore parsing errors
        }
      };

      this.mcpProcess.stdout.on('data', handleResponse);
      this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async initializeWhatsApp() {
    try {
      console.log('🔄 Initializing WhatsApp client...');
      await this.sendCommand('initialize_whatsapp', {
        sessionName: 'auto-responder-session',
        authTimeoutMs: 120000
      });
      
      console.log('✅ WhatsApp client initialized');
    } catch (error) {
      console.error('❌ Failed to initialize WhatsApp:', error.message);
      throw error;
    }
  }

  async configureAutoResponse() {
    try {
      console.log('🔄 Configuring auto-response system...');
      
      // Enable auto-response with intelligent patterns
      const config = await this.sendCommand('configure_auto_response', {
        enabled: true,
        patterns: this.responseRules.slice(0, -1).map(rule => ({
          pattern: rule.patterns[0].source,
          response: Array.isArray(rule.responses) ? rule.responses[0] : rule.responses()[0],
          flags: 'i'
        })),
        rateLimitPerContact: 5, // Max 5 responses per contact per hour
        enableLearning: false, // Disable learning for this demo
        respectPrivacy: true
      });
      
      console.log('✅ Auto-response system configured');
    } catch (error) {
      console.error('❌ Failed to configure auto-response:', error.message);
      // Continue without auto-response configuration
    }
  }

  async startAutoResponding() {
    console.log('🎯 Starting intelligent auto-responder...\n');
    this.isActive = true;
    
    // Monitor for new messages every 3 seconds
    setInterval(async () => {
      if (this.isActive) {
        try {
          await this.processNewMessages();
        } catch (error) {
          console.error('Error processing messages:', error.message);
        }
      }
    }, 3000);
  }

  async processNewMessages() {
    try {
      const result = await this.sendCommand('get_recent_messages', {
        limit: 10,
        onlyUnread: true,
        includeMedia: false
      });

      const data = JSON.parse(result.content[0].text);
      
      if (data.count > 0) {
        console.log(`📨 Processing ${data.count} new messages...`);
        
        for (const message of data.messages) {
          if (!this.processedMessages.has(message.id)) {
            await this.processMessageForAutoResponse(message);
            this.processedMessages.add(message.id);
          }
        }
      }
    } catch (error) {
      // Silently handle polling errors
      if (error.message !== 'Request timeout') {
        console.error('Error checking messages:', error.message);
      }
    }
  }

  async processMessageForAutoResponse(message) {
    // Skip group messages in this demo (can be enabled)
    if (message.isGroup) {
      console.log(`📋 Skipping group message from ${message.from}`);
      return;
    }

    // Skip if we already processed this message
    if (this.processedMessages.has(message.id)) {
      return;
    }

    const messageText = message.body?.toLowerCase() || '';
    const sender = message.from;
    
    console.log(`\n💬 Processing message from ${sender}: "${message.body}"`);

    // Check conversation context and cooldowns
    if (this.isInCooldown(sender, 'general')) {
      console.log(`   ⏳ Sender ${sender} is in cooldown, skipping`);
      return;
    }

    // Find matching rule
    const matchedRule = this.findMatchingRule(messageText);
    
    if (matchedRule) {
      await this.executeResponse(message, matchedRule, messageText);
    }
  }

  findMatchingRule(messageText) {
    for (const rule of this.responseRules) {
      // Check probability for default rule
      if (rule.name === 'default' && Math.random() > rule.probability) {
        continue;
      }

      for (const pattern of rule.patterns) {
        const match = messageText.match(pattern);
        if (match) {
          return { ...rule, match };
        }
      }
    }
    return null;
  }

  async executeResponse(message, rule, messageText) {
    try {
      // Get response text
      let responseText;
      if (typeof rule.responses === 'function') {
        const responses = rule.responses(rule.match);
        responseText = responses[Math.floor(Math.random() * responses.length)];
      } else {
        responseText = rule.responses[Math.floor(Math.random() * rule.responses.length)];
      }

      console.log(`   🎯 Matched rule: ${rule.name}`);
      console.log(`   💬 Responding: "${responseText}"`);

      // Send response
      await this.sendCommand('reply_to_message', {
        messageId: message.id,
        text: responseText,
        mentionAuthor: rule.mentionAuthor !== false
      });

      // Set cooldown if specified
      if (rule.cooldown) {
        this.setCooldown(message.from, rule.name, rule.cooldown);
      }

      // Update conversation context
      this.updateConversationContext(message.from, rule.name, messageText);

      console.log(`   ✅ Response sent successfully`);

      // Mark as read
      await this.sendCommand('mark_as_read', {
        messageId: message.id
      });

    } catch (error) {
      console.error(`   ❌ Failed to send auto-response: ${error.message}`);
    }
  }

  isInCooldown(sender, ruleType) {
    const contextKey = `${sender}_${ruleType}`;
    const context = this.conversationContext.get(contextKey);
    
    if (context && context.lastResponse) {
      const timeSince = Date.now() - context.lastResponse;
      const cooldown = context.cooldown || 300000; // Default 5 minutes
      return timeSince < cooldown;
    }
    
    return false;
  }

  setCooldown(sender, ruleName, duration) {
    const contextKey = `${sender}_${ruleName}`;
    const context = this.conversationContext.get(contextKey) || {};
    context.lastResponse = Date.now();
    context.cooldown = duration;
    this.conversationContext.set(contextKey, context);
  }

  updateConversationContext(sender, ruleName, messageText) {
    const contextKey = `${sender}_conversation`;
    const context = this.conversationContext.get(contextKey) || { history: [] };
    
    context.history.push({
      timestamp: Date.now(),
      rule: ruleName,
      message: messageText
    });

    // Keep only last 5 interactions
    if (context.history.length > 5) {
      context.history = context.history.slice(-5);
    }

    this.conversationContext.set(contextKey, context);
  }

  displayRules() {
    console.log('🎯 Active Response Rules:');
    this.responseRules.forEach((rule, index) => {
      if (rule.name !== 'default') {
        console.log(`  ${index + 1}. ${rule.name} - ${rule.patterns[0]}`);
      }
    });
    console.log('\n💡 Tips:');
    console.log('  - Send "hello" to trigger greeting');
    console.log('  - Send "help" to see available commands');
    console.log('  - Send "2 + 3" for calculations');
    console.log('  - Send "what time" to get current time');
    console.log('  - Press Ctrl+C to stop\n');
  }

  async getStats() {
    try {
      const result = await this.sendCommand('get_message_stats');
      const stats = JSON.parse(result.content[0].text);
      
      console.log('\n📊 Auto-Responder Statistics:');
      console.log(`  Total messages processed: ${this.processedMessages.size}`);
      console.log(`  Active conversations: ${this.conversationContext.size}`);
      console.log(`  Server stats: ${stats.totalMessages} messages in storage`);
    } catch (error) {
      console.error('Failed to get stats:', error.message);
    }
  }

  async stop() {
    console.log('\n🛑 Stopping auto-responder...');
    this.isActive = false;
    
    await this.getStats();
    
    if (this.mcpProcess) {
      this.mcpProcess.kill();
    }
    
    console.log('✅ Auto-responder stopped');
  }
}

// Example usage
async function runAutoResponder() {
  const responder = new WhatsAppAutoResponder();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Received shutdown signal...');
    await responder.stop();
    process.exit(0);
  });

  try {
    await responder.start();
    
    // Show stats every 5 minutes
    setInterval(async () => {
      await responder.getStats();
    }, 300000);
    
  } catch (error) {
    console.error('❌ Failed to start auto-responder:', error.message);
    process.exit(1);
  }
}

// Run the auto-responder if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAutoResponder().catch(console.error);
}

export { WhatsAppAutoResponder };