import { MemoryMessageStore } from '../storage/memory-cache.js';
import { MessageType } from '../types.js';
import type { IncomingMessage, MessageStoreConfig } from '../types.js';

describe('MessageStore', () => {
  let store: MemoryMessageStore;
  let config: MessageStoreConfig;
  let testMessages: IncomingMessage[];

  beforeEach(() => {
    config = {
      maxSize: 100,
      retentionDays: 30,
      enableEncryption: false
    };
    store = new MemoryMessageStore(config);

    testMessages = [
      {
        id: 'msg_1',
        from: '1111111111@c.us',
        to: '0000000000@c.us',
        body: 'Hello World',
        type: MessageType.TEXT,
        timestamp: new Date(Date.now() - 3600000), // 1 hour ago
        isGroup: false,
        hasMedia: false,
        isForwarded: false,
        isStarred: false,
        isRead: false
      },
      {
        id: 'msg_2',
        from: '2222222222@c.us',
        to: '0000000000@c.us',
        body: 'How are you?',
        type: MessageType.TEXT,
        timestamp: new Date(Date.now() - 1800000), // 30 minutes ago
        isGroup: false,
        hasMedia: false,
        isForwarded: false,
        isStarred: false,
        isRead: true
      },
      {
        id: 'msg_3',
        from: '3333333333@c.us',
        to: '0000000000@c.us',
        body: 'Image attached',
        type: MessageType.IMAGE,
        timestamp: new Date(),
        isGroup: false,
        hasMedia: true,
        mediaUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD',
        isForwarded: false,
        isStarred: true,
        isRead: false
      },
      {
        id: 'msg_4',
        from: '1111111111@c.us',
        to: '4444444444-group@g.us',
        body: 'Group message',
        type: MessageType.TEXT,
        timestamp: new Date(Date.now() - 900000), // 15 minutes ago
        isGroup: true,
        author: '1111111111@c.us',
        hasMedia: false,
        isForwarded: false,
        isStarred: false,
        isRead: false
      }
    ];
  });

  describe('Basic Operations', () => {
    it('should save and retrieve messages', async () => {
      const message = testMessages[0];
      await store.save(message);

      const retrieved = await store.get(message.id);
      expect(retrieved).toEqual(message);
    });

    it('should return null for non-existent message', async () => {
      const retrieved = await store.get('non_existent');
      expect(retrieved).toBeNull();
    });

    it('should save multiple messages', async () => {
      for (const message of testMessages) {
        await store.save(message);
      }

      const recent = await store.getRecent(10);
      expect(recent.length).toBe(4);
      
      // Should be sorted by timestamp descending
      expect(recent[0].timestamp >= recent[1].timestamp).toBe(true);
    });

    it('should limit recent messages count', async () => {
      for (const message of testMessages) {
        await store.save(message);
      }

      const recent = await store.getRecent(2);
      expect(recent.length).toBe(2);
    });

    it('should delete messages', async () => {
      const message = testMessages[0];
      await store.save(message);

      await store.delete(message.id);
      const retrieved = await store.get(message.id);
      expect(retrieved).toBeNull();
    });

    it('should clear all messages', async () => {
      for (const message of testMessages) {
        await store.save(message);
      }

      await store.clear();
      const recent = await store.getRecent(10);
      expect(recent.length).toBe(0);
    });
  });

  describe('Chat-based Queries', () => {
    beforeEach(async () => {
      for (const message of testMessages) {
        await store.save(message);
      }
    });

    it('should retrieve messages by chat', async () => {
      const chatMessages = await store.getByChat('1111111111@c.us', 10);
      expect(chatMessages.length).toBe(2);
      expect(chatMessages.every(msg => msg.from === '1111111111@c.us')).toBe(true);
    });

    it('should limit chat messages count', async () => {
      const chatMessages = await store.getByChat('1111111111@c.us', 1);
      expect(chatMessages.length).toBe(1);
    });
  });

  describe('Search Functionality', () => {
    beforeEach(async () => {
      for (const message of testMessages) {
        await store.save(message);
      }
    });

    it('should search messages by content', async () => {
      const results = await store.search('Hello');
      expect(results.length).toBe(1);
      expect(results[0].body).toBe('Hello World');
    });

    it('should search messages case-insensitively', async () => {
      const results = await store.search('HELLO');
      expect(results.length).toBe(1);
      expect(results[0].body).toBe('Hello World');
    });

    it('should search messages by sender', async () => {
      const results = await store.search('1111111111');
      expect(results.length).toBe(2);
      expect(results.every(msg => msg.from.includes('1111111111'))).toBe(true);
    });

    it('should return empty array for no matches', async () => {
      const results = await store.search('nonexistent');
      expect(results.length).toBe(0);
    });
  });

  describe('Filtering', () => {
    beforeEach(async () => {
      for (const message of testMessages) {
        await store.save(message);
      }
    });

    it('should filter by chat ID', async () => {
      const filter = { chatId: '1111111111@c.us' };
      const results = await store.filter(filter);
      expect(results.length).toBe(2);
    });

    it('should filter by message type', async () => {
      const filter = { type: MessageType.IMAGE };
      const results = await store.filter(filter);
      expect(results.length).toBe(1);
      expect(results[0].type).toBe(MessageType.IMAGE);
    });

    it('should filter by read status', async () => {
      const filter = { isUnread: true };
      const results = await store.filter(filter);
      expect(results.length).toBe(3);
      expect(results.every(msg => !msg.isRead)).toBe(true);
    });

    it('should filter by media presence', async () => {
      const filter = { hasMedia: true };
      const results = await store.filter(filter);
      expect(results.length).toBe(1);
      expect(results[0].hasMedia).toBe(true);
    });

    it('should filter by date range', async () => {
      const filter = {
        startDate: new Date(Date.now() - 2000000), // 33 minutes ago
        endDate: new Date()
      };
      const results = await store.filter(filter);
      expect(results.length).toBe(3); // Should exclude the 1-hour-ago message
    });

    it('should filter by search text', async () => {
      const filter = { searchText: 'Hello' };
      const results = await store.filter(filter);
      expect(results.length).toBe(1);
      expect(results[0].body).toBe('Hello World');
    });

    it('should combine multiple filters', async () => {
      const filter = {
        from: '1111111111@c.us',
        type: MessageType.TEXT,
        isUnread: true
      };
      const results = await store.filter(filter);
      expect(results.length).toBe(2);
      expect(results.every(msg => 
        msg.from === '1111111111@c.us' && 
        msg.type === MessageType.TEXT && 
        !msg.isRead
      )).toBe(true);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      for (const message of testMessages) {
        await store.save(message);
      }
    });

    it('should provide accurate statistics', async () => {
      const stats = await store.getStats();
      
      expect(stats.totalMessages).toBe(4);
      expect(stats.totalChats).toBe(4); // 3 individual + 1 group
      expect(stats.messagesByType[MessageType.TEXT]).toBe(3);
      expect(stats.messagesByType[MessageType.IMAGE]).toBe(1);
      expect(stats.oldestMessage).toBeDefined();
      expect(stats.newestMessage).toBeDefined();
      expect(stats.storageSize).toBeGreaterThan(0);
    });
  });

  describe('LRU Cache Behavior', () => {
    it('should evict oldest messages when exceeding max size', async () => {
      const smallConfig = {
        maxSize: 2,
        retentionDays: 30,
        enableEncryption: false
      };
      const smallStore = new MemoryMessageStore(smallConfig);

      // Add 3 messages to a store with max size 2
      await smallStore.save(testMessages[0]);
      await smallStore.save(testMessages[1]);
      await smallStore.save(testMessages[2]);

      const recent = await smallStore.getRecent(10);
      expect(recent.length).toBe(2);
      
      // The first message should have been evicted
      const firstMessage = await smallStore.get(testMessages[0].id);
      expect(firstMessage).toBeNull();
    });
  });

  describe('Message Type Detection', () => {
    it('should handle different message types correctly', () => {
      const messages = store.getMessagesByType(MessageType.TEXT);
      expect(messages).toEqual([]);
      
      // After saving, should return correct messages
      testMessages.forEach(async (msg) => {
        await store.save(msg);
      });
    });
  });

  describe('Cache Information', () => {
    it('should provide cache information', async () => {
      await store.save(testMessages[0]);
      
      const cacheInfo = store.getCacheInfo();
      expect(cacheInfo.size).toBe(1);
      expect(cacheInfo.maxSize).toBe(100);
      expect(cacheInfo.indexSizes.chat).toBeGreaterThan(0);
    });
  });

  describe('Retention Policy', () => {
    it('should respect retention days setting', async () => {
      const retentiveConfig = {
        maxSize: 100,
        retentionDays: 1, // 1 day retention
        enableEncryption: false
      };
      const retentiveStore = new MemoryMessageStore(retentiveConfig);

      // Create a message from 2 days ago
      const oldMessage: IncomingMessage = {
        ...testMessages[0],
        id: 'old_message',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
      };

      // This should not be saved due to retention policy
      await retentiveStore.save(oldMessage);
      const retrieved = await retentiveStore.get('old_message');
      expect(retrieved).toBeNull();

      // Recent message should be saved
      await retentiveStore.save(testMessages[0]);
      const recentRetrieved = await retentiveStore.get(testMessages[0].id);
      expect(recentRetrieved).toEqual(testMessages[0]);
    });
  });
});