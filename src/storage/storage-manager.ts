import { MemoryMessageStore } from './memory-cache.js';
import { SQLiteMessageStore, SQLiteConfig } from './sqlite-adapter.js';
import { MessageStore, MessageStoreStats, MessageStoreConfig } from './message-store.js';
import type { IncomingMessage, MessageFilter, MessageReceivingConfig } from '../types.js';

export class StorageManager implements MessageStore {
  private memoryStore?: MemoryMessageStore;
  private sqliteStore?: SQLiteMessageStore;
  private config: MessageReceivingConfig;

  constructor(config: MessageReceivingConfig) {
    this.config = config;
    this.initializeStores();
  }

  private initializeStores(): void {
    const storeConfig: MessageStoreConfig = {
      maxSize: this.config.maxHistorySize,
      retentionDays: this.config.retentionDays,
      enableEncryption: this.config.encryptStorage,
      encryptionKey: process.env.STORAGE_ENCRYPTION_KEY
    };

    if (this.config.storageType === 'memory' || this.config.storageType === 'both') {
      this.memoryStore = new MemoryMessageStore(storeConfig);
    }

    if (this.config.storageType === 'sqlite' || this.config.storageType === 'both') {
      const sqliteConfig: SQLiteConfig = {
        ...storeConfig,
        dbPath: this.config.storageLocation || './whatsapp_messages.db',
        enableWAL: true,
        busyTimeout: 30000
      };
      this.sqliteStore = new SQLiteMessageStore(sqliteConfig);
    }
  }

  async initialize(): Promise<void> {
    if (this.sqliteStore) {
      await this.sqliteStore.initialize();
    }
  }

  async save(message: IncomingMessage): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.memoryStore) {
      promises.push(this.memoryStore.save(message));
    }

    if (this.sqliteStore && this.config.persistMessages) {
      promises.push(this.sqliteStore.save(message));
    }

    await Promise.all(promises);
  }

  async get(messageId: string): Promise<IncomingMessage | null> {
    // Try memory first (faster), then SQLite
    if (this.memoryStore) {
      const message = await this.memoryStore.get(messageId);
      if (message) {
        return message;
      }
    }

    if (this.sqliteStore) {
      return await this.sqliteStore.get(messageId);
    }

    return null;
  }

  async getRecent(limit: number): Promise<IncomingMessage[]> {
    // Use memory store if available (faster)
    if (this.memoryStore) {
      const messages = await this.memoryStore.getRecent(limit);
      if (messages.length >= limit) {
        return messages;
      }

      // If we need more messages, try SQLite
      if (this.sqliteStore && messages.length < limit) {
        const remainingLimit = limit - messages.length;
        const sqliteMessages = await this.sqliteStore.getRecent(remainingLimit);
        
        // Combine and deduplicate
        const combined = [...messages, ...sqliteMessages];
        const unique = this.deduplicateMessages(combined);
        return unique.slice(0, limit);
      }

      return messages;
    }

    if (this.sqliteStore) {
      return await this.sqliteStore.getRecent(limit);
    }

    return [];
  }

  async getByChat(chatId: string, limit: number): Promise<IncomingMessage[]> {
    // Similar strategy as getRecent
    if (this.memoryStore) {
      const messages = await this.memoryStore.getByChat(chatId, limit);
      if (messages.length >= limit) {
        return messages;
      }

      if (this.sqliteStore && messages.length < limit) {
        const remainingLimit = limit - messages.length;
        const sqliteMessages = await this.sqliteStore.getByChat(chatId, remainingLimit);
        
        const combined = [...messages, ...sqliteMessages];
        const unique = this.deduplicateMessages(combined);
        return unique.slice(0, limit);
      }

      return messages;
    }

    if (this.sqliteStore) {
      return await this.sqliteStore.getByChat(chatId, limit);
    }

    return [];
  }

  async search(query: string): Promise<IncomingMessage[]> {
    const promises: Promise<IncomingMessage[]>[] = [];

    if (this.memoryStore) {
      promises.push(this.memoryStore.search(query));
    }

    if (this.sqliteStore) {
      promises.push(this.sqliteStore.search(query));
    }

    if (promises.length === 0) {
      return [];
    }

    const results = await Promise.all(promises);
    const combined = results.flat();
    return this.deduplicateMessages(combined);
  }

  async filter(filter: MessageFilter): Promise<IncomingMessage[]> {
    const promises: Promise<IncomingMessage[]>[] = [];

    if (this.memoryStore) {
      promises.push(this.memoryStore.filter(filter));
    }

    if (this.sqliteStore) {
      promises.push(this.sqliteStore.filter(filter));
    }

    if (promises.length === 0) {
      return [];
    }

    const results = await Promise.all(promises);
    const combined = results.flat();
    return this.deduplicateMessages(combined);
  }

  async delete(messageId: string): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.memoryStore) {
      promises.push(this.memoryStore.delete(messageId));
    }

    if (this.sqliteStore) {
      promises.push(this.sqliteStore.delete(messageId));
    }

    await Promise.all(promises);
  }

  async clear(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.memoryStore) {
      promises.push(this.memoryStore.clear());
    }

    if (this.sqliteStore) {
      promises.push(this.sqliteStore.clear());
    }

    await Promise.all(promises);
  }

  async getStats(): Promise<MessageStoreStats> {
    if (this.sqliteStore) {
      // SQLite has the most comprehensive data
      return await this.sqliteStore.getStats();
    }

    if (this.memoryStore) {
      return await this.memoryStore.getStats();
    }

    return {
      totalMessages: 0,
      totalChats: 0,
      messagesByType: {}
    };
  }

  private deduplicateMessages(messages: IncomingMessage[]): IncomingMessage[] {
    const seen = new Set<string>();
    const unique: IncomingMessage[] = [];

    for (const message of messages) {
      if (!seen.has(message.id)) {
        seen.add(message.id);
        unique.push(message);
      }
    }

    // Sort by timestamp descending
    return unique.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Additional management methods
  async syncMemoryToSQLite(): Promise<void> {
    if (!this.memoryStore || !this.sqliteStore) {
      return;
    }

    const memoryMessages = this.memoryStore.getQueuedMessages();
    for (const message of memoryMessages) {
      await this.sqliteStore.save(message);
    }
  }

  async loadFromSQLiteToMemory(limit: number = 1000): Promise<void> {
    if (!this.memoryStore || !this.sqliteStore) {
      return;
    }

    const recentMessages = await this.sqliteStore.getRecent(limit);
    for (const message of recentMessages) {
      await this.memoryStore.save(message);
    }
  }

  async backup(backupPath: string): Promise<void> {
    if (this.sqliteStore && 'backup' in this.sqliteStore) {
      await (this.sqliteStore as any).backup(backupPath);
    }
  }

  async vacuum(): Promise<void> {
    if (this.sqliteStore && 'vacuum' in this.sqliteStore) {
      await (this.sqliteStore as any).vacuum();
    }
  }

  getStorageType(): string {
    return this.config.storageType;
  }

  isMemoryEnabled(): boolean {
    return this.memoryStore !== undefined;
  }

  isSQLiteEnabled(): boolean {
    return this.sqliteStore !== undefined;
  }

  async close(): Promise<void> {
    if (this.sqliteStore && 'close' in this.sqliteStore) {
      await (this.sqliteStore as any).close();
    }
  }

  // Privacy mode helpers
  isPrivacyModeEnabled(): boolean {
    return this.config.privacyMode;
  }

  async enablePrivacyMode(): Promise<void> {
    this.config.privacyMode = true;
    // Clear all stored messages in privacy mode
    await this.clear();
  }

  async disablePrivacyMode(): Promise<void> {
    this.config.privacyMode = false;
  }
}