# WhatsApp Message Receiving Guide

This comprehensive guide covers the message receiving capabilities of the WhatsApp MCP server, enabling bi-directional communication with WhatsApp contacts and groups.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [MCP Tools Reference](#mcp-tools-reference)
- [Message Types](#message-types)
- [Storage Systems](#storage-systems)
- [Event System](#event-system)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The WhatsApp MCP server's message receiving feature transforms your WhatsApp into a powerful two-way communication platform. It enables:

- **Real-time message reception** from contacts and groups
- **Intelligent message processing** with filtering and search
- **Automated responses** based on patterns and rules
- **Persistent message storage** with memory and SQLite options
- **Rich analytics and monitoring** capabilities
- **Webhook integrations** for external systems

### Key Features

- ✅ **Message Reception**: Receive text, media, and special messages
- ✅ **Smart Filtering**: Filter by sender, type, date, content, and more  
- ✅ **Storage Options**: Memory cache with SQLite persistence
- ✅ **Search & Analytics**: Full-text search and message statistics
- ✅ **Auto-Response**: Pattern-based intelligent responses
- ✅ **Real-time Events**: Event-driven architecture with webhooks
- ✅ **Message Interactions**: Reply, react, forward, delete messages
- ✅ **Privacy Controls**: Anonymization and privacy modes

## Architecture

The message receiving system consists of several interconnected components:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   WhatsApp      │    │  Message         │    │  Storage        │
│   Client        │────▶  Handler         │────▶  Manager       │
│                 │    │  (Rate Limiting) │    │  (Mem + SQLite) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         │              │  Event System   │              │
         │              │  (EventEmitter) │              │
         │              └─────────────────┘              │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Auto-Response  │    │   Webhook       │    │   MCP Tools     │
│  Engine         │    │   System        │    │   (16 tools)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Components

1. **Message Handler** - Central processing unit with rate limiting
2. **Storage Manager** - Dual storage (memory + SQLite) with LRU caching
3. **Event System** - Real-time notifications for message events
4. **Auto-Response Engine** - Pattern-based automated responses
5. **Webhook System** - External integrations with security
6. **MCP Tools** - 16 tools for message operations via MCP protocol

## Quick Start

### 1. Enable Message Receiving

```javascript
// Basic setup - enable message receiving with default settings
await sendCommand('initialize_whatsapp', {
  sessionName: 'my-session',
  authTimeoutMs: 60000
});

// Configure message receiving
await sendCommand('configure_message_receiving', {
  enableMessageHistory: true,
  storageType: 'hybrid', // memory + sqlite
  maxHistorySize: 1000,
  rateLimitPerMinute: 30
});
```

### 2. Start Receiving Messages

```javascript
// Subscribe to message types
await sendCommand('subscribe_to_messages', {
  messageTypes: ['text', 'image', 'audio', 'video'],
  callback: 'https://your-webhook.com/messages' // optional
});

// Check for new messages
const result = await sendCommand('get_recent_messages', {
  limit: 10,
  onlyUnread: true
});

console.log(result.content[0].text); // JSON with messages
```

### 3. Interact with Messages

```javascript
// Reply to a message
await sendCommand('reply_to_message', {
  messageId: 'msg_123',
  text: 'Thanks for your message!',
  mentionAuthor: true
});

// React to a message
await sendCommand('react_to_message', {
  messageId: 'msg_123',
  emoji: '👍'
});
```

## Configuration

### Message Receiving Configuration

```javascript
const config = {
  // Core settings
  enableMessageHistory: true,        // Store message history
  enableWebhooks: false,            // Send to external webhooks
  enableAutoResponse: true,         // Enable auto-responses
  
  // Storage configuration
  storageType: 'hybrid',            // 'memory', 'sqlite', or 'hybrid'
  maxHistorySize: 1000,            // Max messages in memory
  persistMessages: true,           // Persist to SQLite
  retentionDays: 30,              // Keep messages for 30 days
  
  // Media handling
  autoDownloadMedia: false,        // Download media automatically
  maxMediaSize: 10,               // Max media size in MB
  mediaStoragePath: './media',    // Where to save media
  
  // Performance settings
  rateLimitPerMinute: 60,         // Messages per minute per contact
  maxConcurrentProcessing: 5,     // Parallel message processing
  messageQueueSize: 1000,         // Internal queue size
  
  // Privacy settings
  encryptStorage: false,          // Encrypt stored messages
  privacyMode: false,             // Anonymize contact info
  
  // Webhook settings
  webhookRetries: 3,              // Retry failed webhooks
  webhookTimeout: 5000,           // Webhook timeout in ms
};

await sendCommand('configure_message_receiving', config);
```

### Auto-Response Configuration

```javascript
const autoResponseConfig = {
  enabled: true,
  patterns: [
    {
      pattern: '\\b(hello|hi|hey)\\b',
      response: 'Hello! How can I help you?',
      flags: 'i' // case insensitive
    },
    {
      pattern: '\\b(help|support)\\b',
      response: 'I\'m here to help! What do you need?',
      flags: 'i'
    }
  ],
  rateLimitPerContact: 5,          // Max 5 auto-responses per hour per contact
  enableLearning: false,           // Machine learning (future feature)
  respectPrivacy: true             // Don't auto-respond to sensitive messages
};

await sendCommand('configure_auto_response', autoResponseConfig);
```

## MCP Tools Reference

The message receiving system provides 16 MCP tools organized into categories:

### Basic Message Retrieval

#### `get_recent_messages`
Retrieve recent messages with filtering options.

```javascript
await sendCommand('get_recent_messages', {
  limit: 20,                  // Number of messages to retrieve
  onlyUnread: false,         // Only unread messages
  includeMedia: true,        // Include media messages
  chatId: 'optional'         // Specific chat ID
});
```

#### `get_messages_by_chat`
Get messages from a specific chat or contact.

```javascript
await sendCommand('get_messages_by_chat', {
  chatId: '1234567890@c.us',
  limit: 50,
  includeMedia: true
});
```

#### `search_messages`
Search messages by content, sender, or metadata.

```javascript
await sendCommand('search_messages', {
  query: 'important meeting',
  limit: 10,
  searchIn: 'content',       // 'content', 'sender', or 'all'
  dateRange: {
    start: '2024-01-01',
    end: '2024-12-31'
  }
});
```

#### `get_unread_messages`
Retrieve all unread messages with optional auto-marking.

```javascript
await sendCommand('get_unread_messages', {
  markAsRead: false,         // Automatically mark as read
  groupByChat: true          // Group by chat ID
});
```

#### `get_message_by_id`
Get a specific message by its ID.

```javascript
await sendCommand('get_message_by_id', {
  messageId: 'msg_12345'
});
```

### Advanced Message Interactions

#### `reply_to_message`
Reply to a specific message with mention support.

```javascript
await sendCommand('reply_to_message', {
  messageId: 'msg_12345',
  text: 'Thanks for the update!',
  mentionAuthor: true        // Mention the original sender
});
```

#### `react_to_message`
React to a message with an emoji.

```javascript
await sendCommand('react_to_message', {
  messageId: 'msg_12345',
  emoji: '❤️'
});
```

#### `forward_message`
Forward a message to another chat.

```javascript
await sendCommand('forward_message', {
  messageId: 'msg_12345',
  toChatId: '0987654321@c.us'
});
```

#### `delete_message`
Delete a message (for self or everyone).

```javascript
await sendCommand('delete_message', {
  messageId: 'msg_12345',
  forEveryone: false         // Delete for everyone or just self
});
```

#### `download_media`
Download media from a message.

```javascript
await sendCommand('download_media', {
  messageId: 'msg_12345',
  savePath: './downloads/image.jpg'  // Optional: save to file
});
```

#### `mark_as_read`
Mark specific messages as read.

```javascript
await sendCommand('mark_as_read', {
  messageIds: ['msg_1', 'msg_2', 'msg_3']
});
```

### Real-time Monitoring & Webhooks

#### `subscribe_to_messages`
Subscribe to real-time message notifications.

```javascript
await sendCommand('subscribe_to_messages', {
  messageTypes: ['text', 'image', 'audio'],
  callback: 'https://yourserver.com/webhook',  // Optional webhook URL
  filters: {
    excludeGroups: false,
    senderWhitelist: ['1234567890@c.us']
  }
});
```

#### `get_message_stats`
Get comprehensive message statistics.

```javascript
await sendCommand('get_message_stats', {
  timeRange: 'today',        // 'today', 'week', 'month', or custom
  groupBy: 'hour',          // 'hour', 'day', 'sender', 'type'
  includeCharts: false      // Include chart data
});
```

#### `configure_webhook`
Configure webhook settings for external integrations.

```javascript
await sendCommand('configure_webhook', {
  url: 'https://yourserver.com/webhook',
  secret: 'your-secret-key',           // For HMAC signature verification
  events: ['message', 'read', 'delete'],
  retries: 3,
  timeout: 5000
});
```

#### `get_webhook_status`
Check webhook delivery status and statistics.

```javascript
await sendCommand('get_webhook_status');
```

#### `configure_auto_response`
Configure automatic response rules.

```javascript
await sendCommand('configure_auto_response', {
  enabled: true,
  patterns: [...],
  rateLimitPerContact: 5
});
```

## Message Types

The system supports all WhatsApp message types:

### Text Messages
```javascript
{
  "id": "msg_123",
  "type": "text",
  "body": "Hello World!",
  "from": "1234567890@c.us",
  "timestamp": "2024-01-15T10:30:00Z",
  "isRead": false
}
```

### Media Messages
```javascript
{
  "id": "msg_124",
  "type": "image",
  "body": "Photo caption",
  "hasMedia": true,
  "mediaUrl": "data:image/jpeg;base64,/9j/4AAQ...",
  "from": "1234567890@c.us",
  "timestamp": "2024-01-15T10:31:00Z"
}
```

### Group Messages
```javascript
{
  "id": "msg_125",
  "type": "text",
  "body": "Group announcement",
  "from": "123456-group@g.us",
  "author": "1234567890@c.us",
  "isGroup": true,
  "mentions": ["0987654321@c.us"],
  "timestamp": "2024-01-15T10:32:00Z"
}
```

### Supported Types
- `text` - Regular text messages
- `image` - Images with optional captions
- `audio` - Audio files and voice notes
- `video` - Video files with optional captions
- `document` - Documents and files
- `sticker` - WhatsApp stickers
- `location` - Location sharing
- `contact` - Shared contacts
- `link` - Messages with web links

## Storage Systems

### Memory Storage (MemoryMessageStore)

Fast, in-memory storage with LRU caching:

```javascript
const memoryConfig = {
  maxSize: 1000,              // Max messages in cache
  retentionDays: 7,           // Auto-cleanup older messages
  enableEncryption: false     // Encrypt messages in memory
};
```

**Features:**
- Lightning-fast access
- Automatic LRU eviction
- Full-text search capability
- Multiple indexing strategies
- Memory usage optimization

### SQLite Storage (SQLiteMessageStore)

Persistent storage with full SQL capabilities:

```javascript
const sqliteConfig = {
  dbPath: './messages.db',
  enableWAL: true,           // Write-Ahead Logging for performance
  enableFTS: true,           // Full-Text Search
  autoVacuum: true,          // Automatic database maintenance
  busyTimeout: 5000          // Handle concurrent access
};
```

**Features:**
- Persistent message storage
- Full SQL query support
- ACID compliance
- Full-text search with FTS5
- Automatic indexing
- Database optimization

### Hybrid Storage (Recommended)

Combines memory and SQLite for optimal performance:

```javascript
const hybridConfig = {
  storageType: 'hybrid',
  memory: { maxSize: 500 },
  sqlite: { dbPath: './messages.db' }
};
```

**Benefits:**
- Fast access to recent messages (memory)
- Long-term persistence (SQLite)
- Automatic data movement between tiers
- Best of both worlds

## Event System

The message receiving system uses an event-driven architecture:

### Event Types

```javascript
// Message received event
messageHandler.on('message:received', (message) => {
  console.log('New message:', message);
});

// Message processed event  
messageHandler.on('message:processed', (message) => {
  console.log('Message processed:', message.id);
});

// Storage event
messageHandler.on('storage:saved', (messageId) => {
  console.log('Message saved:', messageId);
});

// Error events
messageHandler.on('error', (error) => {
  console.error('Message handling error:', error);
});
```

### Custom Event Handlers

```javascript
class CustomMessageHandler {
  constructor() {
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // Custom business logic
    messageHandler.on('message:received', this.handleNewMessage.bind(this));
    messageHandler.on('message:media', this.handleMediaMessage.bind(this));
  }
  
  handleNewMessage(message) {
    // Your custom logic here
    if (message.body.includes('urgent')) {
      this.notifyAdmins(message);
    }
  }
}
```

## Examples

### Complete Examples

The `examples/` directory contains three comprehensive examples:

#### 1. Basic Message Receiver (`receive-messages.js`)
- Demonstrates basic message receiving
- Shows polling for new messages
- Implements simple auto-replies
- Real-time message display

**Usage:**
```bash
node examples/receive-messages.js
```

#### 2. Intelligent Auto-Responder (`auto-responder.js`)
- Pattern-based response rules
- Context-aware conversations
- Cooldown management
- Advanced response strategies

**Usage:**
```bash
node examples/auto-responder.js
```

**Features:**
- Greeting detection and responses
- Help system with command explanations  
- Time and date queries
- Basic calculations
- Thank you acknowledgments
- Conversation context tracking

#### 3. Comprehensive Message Logger (`message-logger.js`)
- Complete message logging and analytics
- Privacy-focused anonymization
- Hourly and daily reporting
- Keyword extraction and trends
- Export capabilities

**Usage:**
```bash
node examples/message-logger.js
```

**Features:**
- JSONL format logging
- Real-time statistics
- Contact anonymization
- Keyword tracking
- Daily/hourly reports
- Export to JSON/CSV

### Simple Integration Examples

#### Basic Message Monitoring
```javascript
import { WhatsAppMessageReceiver } from './examples/receive-messages.js';

const receiver = new WhatsAppMessageReceiver();
await receiver.start();

// Monitor for specific keywords
receiver.onMessage((message) => {
  if (message.body.includes('support')) {
    // Escalate to human support
    notifySupport(message);
  }
});
```

#### Auto-Response Integration
```javascript
import { WhatsAppAutoResponder } from './examples/auto-responder.js';

const responder = new WhatsAppAutoResponder();

// Add custom response rules
responder.addRule({
  name: 'business_hours',
  patterns: [/business hours|opening times/i],
  responses: ['Our business hours are 9 AM - 6 PM, Monday to Friday.'],
  mentionAuthor: true
});

await responder.start();
```

## Best Practices

### Performance Optimization

1. **Use Hybrid Storage** for best performance
   ```javascript
   storageType: 'hybrid'  // Memory + SQLite
   ```

2. **Implement Rate Limiting** to avoid overwhelming the system
   ```javascript
   rateLimitPerMinute: 30  // Conservative limit
   ```

3. **Configure Message Queue Size** appropriately
   ```javascript
   messageQueueSize: 500  // Balance memory vs reliability
   ```

4. **Use Selective Media Download**
   ```javascript
   autoDownloadMedia: false  // Download on-demand only
   ```

### Security & Privacy

1. **Enable Privacy Mode** for sensitive environments
   ```javascript
   privacyMode: true  // Anonymize contact information
   ```

2. **Use HTTPS for Webhooks** with signature verification
   ```javascript
   webhook: {
     url: 'https://secure-server.com/webhook',
     secret: 'strong-secret-key'
   }
   ```

3. **Implement Message Retention** policies
   ```javascript
   retentionDays: 30  // Auto-delete old messages
   ```

4. **Encrypt Sensitive Data** when storing
   ```javascript
   encryptStorage: true  // Encrypt stored messages
   ```

### Error Handling

1. **Implement Comprehensive Error Handling**
   ```javascript
   try {
     await sendCommand('get_recent_messages', params);
   } catch (error) {
     console.error('Failed to retrieve messages:', error);
     // Implement retry logic or fallback
   }
   ```

2. **Monitor Webhook Delivery**
   ```javascript
   // Check webhook status regularly
   const status = await sendCommand('get_webhook_status');
   if (status.failed_deliveries > 10) {
     // Alert administrators
   }
   ```

3. **Handle Rate Limiting Gracefully**
   ```javascript
   if (error.message.includes('Rate limit exceeded')) {
     // Wait before retrying
     await new Promise(resolve => setTimeout(resolve, 60000));
   }
   ```

### Monitoring & Analytics

1. **Track Key Metrics**
   ```javascript
   // Monitor message processing stats
   const stats = await sendCommand('get_message_stats');
   console.log('Messages/hour:', stats.messagesPerHour);
   ```

2. **Set Up Alerts** for system health
   ```javascript
   if (stats.queueSize > 800) {
     // Alert: Message queue nearly full
     notifyAdmins('High message queue detected');
   }
   ```

3. **Regular Health Checks**
   ```javascript
   setInterval(async () => {
     const status = await sendCommand('get_whatsapp_status');
     if (!status.isConnected) {
       // Reconnection logic
     }
   }, 60000);
   ```

## Troubleshooting

### Common Issues

#### 1. Messages Not Being Received

**Symptoms:** No messages appear in get_recent_messages

**Solutions:**
- Verify WhatsApp client is connected: `get_whatsapp_status`
- Check message receiving is enabled: `configure_message_receiving`
- Verify QR code was scanned and authenticated
- Check for rate limiting or queue overflow

```javascript
// Debug message receiving
const status = await sendCommand('get_whatsapp_status');
console.log('Connected:', status.isConnected);

const stats = await sendCommand('get_message_stats');
console.log('Queue size:', stats.queueSize);
```

#### 2. High Memory Usage

**Symptoms:** Node.js process using excessive memory

**Solutions:**
- Reduce `maxHistorySize` in configuration
- Enable automatic cleanup: `retentionDays: 7`
- Use SQLite storage instead of memory
- Implement periodic cache clearing

```javascript
// Reduce memory usage
const config = {
  maxHistorySize: 100,        // Reduce from default
  storageType: 'sqlite',      // Use disk storage
  retentionDays: 7            // Clean old messages
};
```

#### 3. Webhook Delivery Failures

**Symptoms:** External webhooks not receiving messages

**Solutions:**
- Check webhook URL accessibility
- Verify HMAC signature implementation
- Monitor webhook status and retry logic
- Check network connectivity and firewall rules

```javascript
// Debug webhook delivery
const webhookStatus = await sendCommand('get_webhook_status');
console.log('Failed deliveries:', webhookStatus.failed_deliveries);
console.log('Last success:', webhookStatus.last_successful_delivery);
```

#### 4. Auto-Response Not Working

**Symptoms:** No automatic replies being sent

**Solutions:**
- Verify auto-response is enabled
- Check pattern matching syntax (regex)
- Monitor rate limiting per contact
- Test patterns with sample messages

```javascript
// Test auto-response pattern
const testMessage = "Hello, I need help";
const pattern = /\b(hello|hi|hey)\b/i;
console.log('Pattern matches:', pattern.test(testMessage));
```

#### 5. Storage/Database Errors

**Symptoms:** SQLite errors or memory storage issues

**Solutions:**
- Check database file permissions
- Verify disk space availability
- Monitor database locks and concurrent access
- Consider switching storage types

```javascript
// Check storage health
try {
  const storageStats = await messageHandler.getStorageStats();
  console.log('Storage type:', storageStats.type);
  console.log('Message count:', storageStats.messageCount);
} catch (error) {
  console.error('Storage error:', error);
}
```

### Debug Mode

Enable detailed logging for troubleshooting:

```javascript
const debugConfig = {
  enableDebugLogging: true,
  logLevel: 'debug',
  logToFile: './debug.log'
};

await sendCommand('configure_message_receiving', debugConfig);
```

### Performance Profiling

Monitor system performance:

```javascript
// Performance monitoring
setInterval(async () => {
  const stats = await sendCommand('get_message_stats');
  const memory = process.memoryUsage();
  
  console.log('Performance Stats:');
  console.log('- Messages/minute:', stats.messagesPerMinute);
  console.log('- Queue size:', stats.queueSize);  
  console.log('- Memory usage:', Math.round(memory.heapUsed / 1024 / 1024), 'MB');
  console.log('- Processing latency:', stats.averageProcessingTime, 'ms');
}, 60000);
```

### Log Analysis

Analyze logs for patterns and issues:

```javascript
// Log analysis helper
function analyzeLogs(logPath) {
  const logs = fs.readFileSync(logPath, 'utf8').split('\n');
  const errors = logs.filter(line => line.includes('ERROR'));
  const warnings = logs.filter(line => line.includes('WARN'));
  
  console.log(`Found ${errors.length} errors and ${warnings.length} warnings`);
  
  // Show most common errors
  const errorCounts = {};
  errors.forEach(error => {
    const errorType = error.match(/ERROR: (.+?):/)?.[1] || 'Unknown';
    errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
  });
  
  console.log('Top errors:', errorCounts);
}
```

## Support & Documentation

- **API Reference**: Complete MCP tool documentation
- **Examples**: Working code examples in `examples/` directory  
- **Type Definitions**: TypeScript definitions in `src/types.ts`
- **Source Code**: Fully documented source code
- **Tests**: Comprehensive test suite in `src/__tests__/`

For additional support, consult the main README.md or raise an issue in the project repository.

---

*This guide covers the complete message receiving functionality. For basic WhatsApp sending capabilities, see the main README.md file.*