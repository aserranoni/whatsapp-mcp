# WhatsApp Message Receiving Feature - Implementation Roadmap

## Overview
This document outlines the comprehensive plan for implementing two-way messaging capabilities in the WhatsApp MCP server, enabling Claude and other MCP clients to receive, process, and respond to incoming WhatsApp messages.

## Status: 📋 PLANNED

## Branch Strategy
- **Branch name**: `feature/receive-messages`
- **Base branch**: `main`
- **Target completion**: TBD

## Implementation Plan (7 Commits)

---

## Phase 1: Core Message Receiving Infrastructure

### Commit 1: Message types and data structures
**Files to create/modify:**
- `src/types/messages.ts` (new)
- `src/types.ts` (modify)

**Implementation details:**
```typescript
// New message types to implement
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  DOCUMENT = 'document',
  STICKER = 'sticker',
  LOCATION = 'location',
  CONTACT = 'contact',
  LINK = 'link'
}

export interface IncomingMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  type: MessageType;
  timestamp: Date;
  isGroup: boolean;
  author?: string;
  hasMedia: boolean;
  mediaUrl?: string;
  quotedMessage?: QuotedMessage;
  mentions?: string[];
  isForwarded: boolean;
  isStarred: boolean;
  isRead: boolean;
}

export interface MessageFilter {
  chatId?: string;
  type?: MessageType;
  from?: string;
  startDate?: Date;
  endDate?: Date;
  isUnread?: boolean;
  hasMedia?: boolean;
  searchText?: string;
}

export interface QuotedMessage {
  id: string;
  body: string;
  from: string;
  timestamp: Date;
}

export interface MessageEvent {
  type: 'received' | 'sent' | 'read' | 'deleted';
  message: IncomingMessage;
  timestamp: Date;
}
```

---

### Commit 2: Message handler and event system
**Files to create/modify:**
- `src/handlers/message-handler.ts` (new)
- `src/handlers/event-emitter.ts` (new)
- `src/whatsapp-client.ts` (modify)

**Implementation details:**
```typescript
import { EventEmitter } from 'events';

export class MessageHandler extends EventEmitter {
  private messageQueue: IncomingMessage[] = [];
  private processedMessages: Set<string> = new Set();
  private rateLimiter: RateLimiter;
  
  constructor(config: MessageHandlerConfig) {
    super();
    this.rateLimiter = new RateLimiter(config.rateLimitPerMinute);
  }
  
  async processMessage(rawMessage: any): Promise<IncomingMessage> {
    // Convert WhatsApp Web.js message to our format
    // Add to queue
    // Emit events
    // Handle rate limiting
  }
  
  onMessage(callback: (msg: IncomingMessage) => void): void {
    this.on('message', callback);
  }
  
  onMediaMessage(callback: (msg: IncomingMessage) => void): void {
    this.on('media', callback);
  }
  
  filterMessages(filter: MessageFilter): IncomingMessage[] {
    // Filter logic
  }
}
```

---

### Commit 3: Message storage and history
**Files to create/modify:**
- `src/storage/message-store.ts` (new)
- `src/storage/sqlite-adapter.ts` (new)
- `src/storage/memory-cache.ts` (new)

**Implementation details:**
```typescript
export interface MessageStore {
  save(message: IncomingMessage): Promise<void>;
  get(messageId: string): Promise<IncomingMessage | null>;
  getRecent(limit: number): Promise<IncomingMessage[]>;
  getByChat(chatId: string, limit: number): Promise<IncomingMessage[]>;
  search(query: string): Promise<IncomingMessage[]>;
  delete(messageId: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryMessageStore implements MessageStore {
  private messages: Map<string, IncomingMessage> = new Map();
  private maxSize: number = 1000;
  
  // LRU cache implementation
}

export class SQLiteMessageStore implements MessageStore {
  private db: Database;
  
  // SQLite persistence implementation
}
```

---

## Phase 2: MCP Tools for Message Operations

### Commit 4: Basic message retrieval tools
**New MCP tools to implement:**

```typescript
// Tool: get_recent_messages
{
  name: 'get_recent_messages',
  description: 'Fetch recent WhatsApp messages with optional filters',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', default: 20 },
      chatId: { type: 'string' },
      onlyUnread: { type: 'boolean', default: false },
      includeMedia: { type: 'boolean', default: true }
    }
  }
}

// Tool: get_message_by_id
{
  name: 'get_message_by_id',
  description: 'Retrieve a specific message by its ID',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string' }
    },
    required: ['messageId']
  }
}

// Tool: get_conversation_history
{
  name: 'get_conversation_history',
  description: 'Get message history from a specific chat',
  inputSchema: {
    type: 'object',
    properties: {
      chatId: { type: 'string' },
      limit: { type: 'number', default: 50 },
      before: { type: 'string' }, // ISO date
      after: { type: 'string' }   // ISO date
    },
    required: ['chatId']
  }
}

// Tool: search_messages
{
  name: 'search_messages',
  description: 'Search messages by content or sender',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      chatId: { type: 'string' },
      from: { type: 'string' },
      limit: { type: 'number', default: 20 }
    },
    required: ['query']
  }
}

// Tool: get_unread_messages
{
  name: 'get_unread_messages',
  description: 'Fetch all unread messages',
  inputSchema: {
    type: 'object',
    properties: {
      markAsRead: { type: 'boolean', default: false }
    }
  }
}
```

---

### Commit 5: Advanced message interaction tools
**New MCP tools to implement:**

```typescript
// Tool: mark_as_read
{
  name: 'mark_as_read',
  description: 'Mark messages as read',
  inputSchema: {
    type: 'object',
    properties: {
      messageIds: { type: 'array', items: { type: 'string' } },
      chatId: { type: 'string' }
    }
  }
}

// Tool: react_to_message
{
  name: 'react_to_message',
  description: 'Add emoji reaction to a message',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string' },
      emoji: { type: 'string' }
    },
    required: ['messageId', 'emoji']
  }
}

// Tool: reply_to_message
{
  name: 'reply_to_message',
  description: 'Reply to a specific message with quote',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string' },
      text: { type: 'string' },
      mentionAuthor: { type: 'boolean', default: true }
    },
    required: ['messageId', 'text']
  }
}

// Tool: forward_message
{
  name: 'forward_message',
  description: 'Forward a message to another chat',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string' },
      toChatId: { type: 'string' }
    },
    required: ['messageId', 'toChatId']
  }
}

// Tool: delete_message
{
  name: 'delete_message',
  description: 'Delete a message',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string' },
      forEveryone: { type: 'boolean', default: false }
    },
    required: ['messageId']
  }
}

// Tool: download_media
{
  name: 'download_media',
  description: 'Download media from a message',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string' },
      savePath: { type: 'string' }
    },
    required: ['messageId']
  }
}
```

---

### Commit 6: Real-time monitoring and webhooks
**New features to implement:**

```typescript
// Tool: subscribe_to_messages
{
  name: 'subscribe_to_messages',
  description: 'Subscribe to real-time message updates',
  inputSchema: {
    type: 'object',
    properties: {
      chatIds: { type: 'array', items: { type: 'string' } },
      messageTypes: { type: 'array', items: { type: 'string' } },
      callback: { type: 'string' } // Webhook URL
    }
  }
}

// Tool: set_message_webhook
{
  name: 'set_message_webhook',
  description: 'Configure webhook for new messages',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      events: { type: 'array', items: { type: 'string' } },
      secret: { type: 'string' }
    },
    required: ['url']
  }
}

// Tool: set_auto_response
{
  name: 'set_auto_response',
  description: 'Configure automatic message responses',
  inputSchema: {
    type: 'object',
    properties: {
      rules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            trigger: { type: 'string' },
            response: { type: 'string' },
            chatIds: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  }
}

// Tool: get_typing_status
{
  name: 'get_typing_status',
  description: 'Get current typing status for chats',
  inputSchema: {
    type: 'object',
    properties: {
      chatId: { type: 'string' }
    }
  }
}

// Tool: monitor_online_status
{
  name: 'monitor_online_status',
  description: 'Monitor contact online status',
  inputSchema: {
    type: 'object',
    properties: {
      contactIds: { type: 'array', items: { type: 'string' } }
    }
  }
}
```

---

## Phase 3: Testing and Documentation

### Commit 7: Tests, examples, and documentation
**Files to create:**
- `src/__tests__/message-handler.test.ts`
- `src/__tests__/message-store.test.ts`
- `src/__tests__/message-tools.test.ts`
- `examples/receive-messages.js`
- `examples/auto-responder.js`
- `examples/message-logger.js`
- `docs/MESSAGE_RECEIVING.md`

**Test coverage targets:**
- Unit tests: 90%+ coverage
- Integration tests for all tools
- End-to-end message flow tests
- Performance tests for large message volumes

---

## Configuration Schema

```typescript
interface MessageReceivingConfig {
  // Feature flags
  enableMessageHistory: boolean;
  enableWebhooks: boolean;
  enableAutoResponse: boolean;
  
  // Storage settings
  storageType: 'memory' | 'sqlite' | 'both';
  maxHistorySize: number;
  persistMessages: boolean;
  storageLocation?: string;
  retentionDays: number;
  
  // Media handling
  autoDownloadMedia: boolean;
  maxMediaSize: number; // in MB
  mediaStoragePath: string;
  
  // Performance
  rateLimitPerMinute: number;
  maxConcurrentProcessing: number;
  messageQueueSize: number;
  
  // Privacy & Security
  encryptStorage: boolean;
  allowedSenders?: string[];
  blockedSenders?: string[];
  privacyMode: boolean; // No storage mode
  
  // Webhook settings
  webhookUrl?: string;
  webhookSecret?: string;
  webhookRetries: number;
  webhookTimeout: number;
}
```

---

## Migration Strategy

### Backward Compatibility
- All existing functionality remains unchanged
- New features are opt-in via configuration
- No breaking changes to existing API

### Gradual Rollout
1. **Phase 1**: Basic message receiving (read-only)
2. **Phase 2**: Message interactions (reply, react, forward)
3. **Phase 3**: Advanced features (webhooks, auto-response)

### Feature Flags
```typescript
const FEATURE_FLAGS = {
  MESSAGE_RECEIVING: process.env.ENABLE_MESSAGE_RECEIVING === 'true',
  MESSAGE_STORAGE: process.env.ENABLE_MESSAGE_STORAGE === 'true',
  WEBHOOKS: process.env.ENABLE_WEBHOOKS === 'true',
  AUTO_RESPONSE: process.env.ENABLE_AUTO_RESPONSE === 'true'
};
```

---

## Security Considerations

### Input Validation
- Sanitize all incoming message content
- Validate media file types and sizes
- Rate limiting per sender
- Message content filtering

### Data Protection
- Encryption at rest for stored messages
- Secure webhook authentication
- Privacy mode with no persistence
- GDPR compliance with data retention

### Access Control
- Sender allowlist/blocklist
- Group-specific permissions
- Read-only mode option
- Audit logging

---

## Performance Targets

- **Message Processing**: < 100ms per message
- **Storage Write**: < 50ms per message
- **Search Query**: < 200ms for 10k messages
- **Memory Usage**: < 100MB for 10k cached messages
- **Concurrent Messages**: Handle 100+ simultaneous messages

---

## Success Metrics

- ✅ All message types supported
- ✅ 90%+ test coverage
- ✅ < 0.1% message loss rate
- ✅ < 200ms average processing time
- ✅ Backward compatibility maintained
- ✅ Documentation complete
- ✅ Examples for all use cases

---

## Future Enhancements (Post-MVP)

1. **Machine Learning Integration**
   - Message classification
   - Spam detection
   - Sentiment analysis
   - Language detection

2. **Advanced Analytics**
   - Message statistics
   - Conversation insights
   - Response time tracking
   - Engagement metrics

3. **Business Features**
   - Customer support workflows
   - Ticket creation from messages
   - CRM integration
   - Multi-agent support

4. **AI Capabilities**
   - Smart auto-responses
   - Context-aware replies
   - Message summarization
   - Translation support

---

## Implementation Timeline

- **Week 1**: Phase 1 (Core Infrastructure)
- **Week 2**: Phase 2 (MCP Tools)
- **Week 3**: Phase 3 (Testing & Documentation)
- **Week 4**: Integration testing & bug fixes

---

## Notes

This is a living document that will be updated as implementation progresses. Each commit should reference this roadmap and update it with any deviations or improvements discovered during development.

**Last Updated**: 2024-01-13
**Status**: PLANNED
**Owner**: Development Team