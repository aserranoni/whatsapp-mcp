import { MessageHandler } from '../handlers/message-handler.js';
import { MessageType } from '../types.js';
import type { MessageHandlerConfig, MessageReceivingConfig } from '../types.js';

describe('MessageHandler', () => {
  let messageHandler: MessageHandler;
  let config: MessageHandlerConfig;

  beforeEach(() => {
    config = {
      rateLimitPerMinute: 60,
      enableStorage: true,
      enableWebhooks: false,
      maxQueueSize: 1000
    };
    messageHandler = new MessageHandler(config);
  });

  afterEach(async () => {
    await messageHandler.closeStorage();
  });

  describe('Message Processing', () => {
    it('should process a text message correctly', async () => {
      const rawMessage = {
        id: { _serialized: 'test_123' },
        from: '1234567890@c.us',
        to: '0987654321@c.us',
        body: 'Hello World',
        type: 'chat',
        timestamp: Math.floor(Date.now() / 1000),
        hasMedia: false,
        isForwarded: false,
        isStarred: false,
        author: '1234567890@c.us'
      };

      const processedMessage = await messageHandler.processMessage(rawMessage);

      expect(processedMessage.id).toBe('test_123');
      expect(processedMessage.from).toBe('1234567890@c.us');
      expect(processedMessage.body).toBe('Hello World');
      expect(processedMessage.type).toBe(MessageType.TEXT);
      expect(processedMessage.hasMedia).toBe(false);
      expect(processedMessage.isGroup).toBe(false);
    });

    it('should detect group messages correctly', async () => {
      const rawMessage = {
        id: { _serialized: 'group_123' },
        from: '1234567890-group@g.us',
        to: '',
        body: 'Group message',
        type: 'chat',
        timestamp: Math.floor(Date.now() / 1000),
        hasMedia: false,
        isForwarded: false,
        isStarred: false,
        author: '1234567890@c.us'
      };

      const processedMessage = await messageHandler.processMessage(rawMessage);

      expect(processedMessage.isGroup).toBe(true);
      expect(processedMessage.author).toBe('1234567890@c.us');
    });

    it('should handle media messages', async () => {
      const rawMessage = {
        id: { _serialized: 'media_123' },
        from: '1234567890@c.us',
        to: '0987654321@c.us',
        body: '',
        type: 'image',
        timestamp: Math.floor(Date.now() / 1000),
        hasMedia: true,
        isForwarded: false,
        isStarred: false,
        author: '1234567890@c.us',
        downloadMedia: jest.fn().mockResolvedValue({
          mimetype: 'image/jpeg',
          data: 'base64data'
        })
      };

      const processedMessage = await messageHandler.processMessage(rawMessage);

      expect(processedMessage.type).toBe(MessageType.IMAGE);
      expect(processedMessage.hasMedia).toBe(true);
      expect(processedMessage.mediaUrl).toContain('data:image/jpeg;base64');
    });

    it('should prevent duplicate message processing', async () => {
      const rawMessage = {
        id: { _serialized: 'duplicate_123' },
        from: '1234567890@c.us',
        to: '0987654321@c.us',
        body: 'Duplicate test',
        type: 'chat',
        timestamp: Math.floor(Date.now() / 1000),
        hasMedia: false,
        isForwarded: false,
        isStarred: false,
        author: '1234567890@c.us'
      };

      // Process the same message twice
      const firstResult = await messageHandler.processMessage(rawMessage);
      const secondResult = await messageHandler.processMessage(rawMessage);

      expect(firstResult.id).toBe(secondResult.id);
      // Should not throw error but should be handled gracefully
      const processedIds = messageHandler.getProcessedMessageIds();
      expect(processedIds.includes('duplicate_123')).toBe(true);
    });
  });

  describe('Message Filtering', () => {
    beforeEach(async () => {
      // Add some test messages
      const messages = [
        {
          id: { _serialized: 'filter_1' },
          from: '1111111111@c.us',
          to: '0000000000@c.us',
          body: 'Hello from user 1',
          type: 'chat',
          timestamp: Math.floor(Date.now() / 1000) - 3600,
          hasMedia: false,
          isForwarded: false,
          isStarred: false
        },
        {
          id: { _serialized: 'filter_2' },
          from: '2222222222@c.us',
          to: '0000000000@c.us',
          body: 'Hello from user 2',
          type: 'chat',
          timestamp: Math.floor(Date.now() / 1000) - 1800,
          hasMedia: false,
          isForwarded: false,
          isStarred: false
        },
        {
          id: { _serialized: 'filter_3' },
          from: '1111111111@c.us',
          to: '0000000000@c.us',
          body: 'Image message',
          type: 'image',
          timestamp: Math.floor(Date.now() / 1000),
          hasMedia: true,
          isForwarded: false,
          isStarred: false
        }
      ];

      for (const msg of messages) {
        await messageHandler.processMessage(msg);
      }
    });

    it('should filter messages by sender', async () => {
      const filter = {
        from: '1111111111@c.us'
      };

      const results = await messageHandler.filterMessages(filter);
      expect(results.length).toBe(2);
      expect(results.every(msg => msg.from === '1111111111@c.us')).toBe(true);
    });

    it('should filter messages by type', async () => {
      const filter = {
        type: MessageType.IMAGE
      };

      const results = await messageHandler.filterMessages(filter);
      expect(results.length).toBe(1);
      expect(results[0].type).toBe(MessageType.IMAGE);
    });

    it('should filter messages by date range', async () => {
      const filter = {
        startDate: new Date(Date.now() - 2000 * 1000), // 2000 seconds ago
        endDate: new Date()
      };

      const results = await messageHandler.filterMessages(filter);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should search messages by text content', async () => {
      const filter = {
        searchText: 'user 2'
      };

      const results = await messageHandler.filterMessages(filter);
      expect(results.length).toBe(1);
      expect(results[0].body).toContain('user 2');
    });
  });

  describe('Message Marking', () => {
    it('should mark messages as read', () => {
      // First add a message to the queue
      const message = {
        id: 'read_test_123',
        from: '1234567890@c.us',
        to: '0987654321@c.us',
        body: 'Test message',
        type: MessageType.TEXT,
        timestamp: new Date(),
        isGroup: false,
        hasMedia: false,
        isForwarded: false,
        isStarred: false,
        isRead: false
      };

      // Manually add to queue for testing
      messageHandler['messageQueue'].push(message);

      const result = messageHandler.markAsRead('read_test_123');
      expect(result).toBe(true);
      
      const updatedMessage = messageHandler['messageQueue'].find(m => m.id === 'read_test_123');
      expect(updatedMessage?.isRead).toBe(true);
    });

    it('should mark multiple messages as read', () => {
      // Add test messages
      const messages = [
        {
          id: 'multi_1',
          from: '1111111111@c.us',
          to: '0000000000@c.us',
          body: 'Message 1',
          type: MessageType.TEXT,
          timestamp: new Date(),
          isGroup: false,
          hasMedia: false,
          isForwarded: false,
          isStarred: false,
          isRead: false
        },
        {
          id: 'multi_2',
          from: '2222222222@c.us',
          to: '0000000000@c.us',
          body: 'Message 2',
          type: MessageType.TEXT,
          timestamp: new Date(),
          isGroup: false,
          hasMedia: false,
          isForwarded: false,
          isStarred: false,
          isRead: false
        }
      ];

      messageHandler['messageQueue'].push(...messages);

      const readCount = messageHandler.markMultipleAsRead(['multi_1', 'multi_2']);
      expect(readCount).toBe(2);
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      // Create handler with very low rate limit
      const restrictiveConfig = {
        rateLimitPerMinute: 1,
        enableStorage: true,
        enableWebhooks: false,
        maxQueueSize: 1000
      };
      const restrictiveHandler = new MessageHandler(restrictiveConfig);

      const rawMessage = {
        id: { _serialized: 'rate_test_1' },
        from: '1234567890@c.us',
        to: '0987654321@c.us',
        body: 'Rate limit test',
        type: 'chat',
        timestamp: Math.floor(Date.now() / 1000),
        hasMedia: false,
        isForwarded: false,
        isStarred: false
      };

      // First message should succeed
      await restrictiveHandler.processMessage(rawMessage);

      // Second message from same sender should be rate limited
      rawMessage.id._serialized = 'rate_test_2';
      
      await expect(restrictiveHandler.processMessage(rawMessage))
        .rejects.toThrow('Rate limit exceeded');

      await restrictiveHandler.closeStorage();
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', async () => {
      const rawMessage = {
        id: { _serialized: 'stats_test' },
        from: '1234567890@c.us',
        to: '0987654321@c.us',
        body: 'Stats test message',
        type: 'chat',
        timestamp: Math.floor(Date.now() / 1000),
        hasMedia: false,
        isForwarded: false,
        isStarred: false
      };

      await messageHandler.processMessage(rawMessage);

      const stats = await messageHandler.getStats();
      expect(stats.totalProcessed).toBe(1);
      expect(stats.queueSize).toBe(1);
    });
  });

  describe('Storage Configuration', () => {
    it('should configure storage correctly', async () => {
      const storageConfig: MessageReceivingConfig = {
        enableMessageHistory: true,
        enableWebhooks: false,
        enableAutoResponse: false,
        storageType: 'memory',
        maxHistorySize: 500,
        persistMessages: true,
        retentionDays: 7,
        autoDownloadMedia: false,
        maxMediaSize: 5,
        mediaStoragePath: './test_media',
        rateLimitPerMinute: 30,
        maxConcurrentProcessing: 5,
        messageQueueSize: 500,
        encryptStorage: false,
        privacyMode: false,
        webhookRetries: 2,
        webhookTimeout: 3000
      };

      messageHandler.configureStorage(storageConfig);
      await messageHandler.initializeStorage();

      const storageManager = messageHandler.getStorageManager();
      expect(storageManager).toBeDefined();
      expect(storageManager?.getStorageType()).toBe('memory');
    });
  });
});