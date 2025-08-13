import { BaseMessageStore, MessageStoreStats } from './message-store.js';
import type { IncomingMessage, MessageFilter, MessageType } from '../types.js';

interface CacheEntry {
  message: IncomingMessage;
  lastAccessed: Date;
}

export class MemoryMessageStore extends BaseMessageStore {
  private messages: Map<string, CacheEntry> = new Map();
  private chatIndex: Map<string, Set<string>> = new Map();
  private typeIndex: Map<MessageType, Set<string>> = new Map();
  private timeIndex: Map<string, string[]> = new Map(); // date string -> message ids

  async save(message: IncomingMessage): Promise<void> {
    // Check retention before saving
    if (!this.shouldRetainMessage(message)) {
      return;
    }

    // Enforce size limit
    if (this.messages.size >= this.config.maxSize) {
      await this.evictOldest();
    }

    // Save message
    this.messages.set(message.id, {
      message: { ...message },
      lastAccessed: new Date()
    });

    // Update indexes
    this.updateIndexes(message);
  }

  async get(messageId: string): Promise<IncomingMessage | null> {
    const entry = this.messages.get(messageId);
    if (!entry) {
      return null;
    }

    // Update access time for LRU
    entry.lastAccessed = new Date();
    return { ...entry.message };
  }

  async getRecent(limit: number): Promise<IncomingMessage[]> {
    const allMessages = Array.from(this.messages.values())
      .map(entry => entry.message)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);

    return allMessages.map(msg => ({ ...msg }));
  }

  async getByChat(chatId: string, limit: number): Promise<IncomingMessage[]> {
    const messageIds = this.chatIndex.get(chatId);
    if (!messageIds) {
      return [];
    }

    const chatMessages = Array.from(messageIds)
      .map(id => this.messages.get(id))
      .filter((entry): entry is CacheEntry => entry !== undefined)
      .map(entry => entry.message)
      .filter(msg => msg.from === chatId || msg.to === chatId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);

    return chatMessages.map(msg => ({ ...msg }));
  }

  async search(query: string): Promise<IncomingMessage[]> {
    const searchTerm = query.toLowerCase();
    const results: IncomingMessage[] = [];

    for (const entry of this.messages.values()) {
      const message = entry.message;
      if (
        message.body.toLowerCase().includes(searchTerm) ||
        message.from.toLowerCase().includes(searchTerm) ||
        message.author?.toLowerCase().includes(searchTerm)
      ) {
        results.push({ ...message });
      }
    }

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async filter(filter: MessageFilter): Promise<IncomingMessage[]> {
    const allMessages = Array.from(this.messages.values()).map(entry => entry.message);
    return this.filterMessages(allMessages, filter);
  }

  async delete(messageId: string): Promise<void> {
    const entry = this.messages.get(messageId);
    if (!entry) {
      return;
    }

    const message = entry.message;

    // Remove from main store
    this.messages.delete(messageId);

    // Update indexes
    this.removeFromIndexes(message);
  }

  async clear(): Promise<void> {
    this.messages.clear();
    this.chatIndex.clear();
    this.typeIndex.clear();
    this.timeIndex.clear();
  }

  async getStats(): Promise<MessageStoreStats> {
    const allMessages = Array.from(this.messages.values()).map(entry => entry.message);
    
    if (allMessages.length === 0) {
      return {
        totalMessages: 0,
        totalChats: 0,
        messagesByType: {},
        storageSize: 0
      };
    }

    const timestamps = allMessages.map(msg => msg.timestamp);
    const oldestMessage = new Date(Math.min(...timestamps.map(t => t.getTime())));
    const newestMessage = new Date(Math.max(...timestamps.map(t => t.getTime())));

    const messagesByType: Record<string, number> = {};
    const uniqueChats = new Set<string>();

    for (const message of allMessages) {
      messagesByType[message.type] = (messagesByType[message.type] || 0) + 1;
      uniqueChats.add(message.from);
      if (message.to) {
        uniqueChats.add(message.to);
      }
    }

    // Estimate storage size (rough calculation)
    const storageSize = JSON.stringify(allMessages).length * 2; // UTF-16 encoding

    return {
      totalMessages: allMessages.length,
      totalChats: uniqueChats.size,
      oldestMessage,
      newestMessage,
      messagesByType,
      storageSize
    };
  }

  private updateIndexes(message: IncomingMessage): void {
    // Update chat index
    if (!this.chatIndex.has(message.from)) {
      this.chatIndex.set(message.from, new Set());
    }
    this.chatIndex.get(message.from)!.add(message.id);

    if (message.to && !this.chatIndex.has(message.to)) {
      this.chatIndex.set(message.to, new Set());
    }
    if (message.to) {
      this.chatIndex.get(message.to)!.add(message.id);
    }

    // Update type index
    if (!this.typeIndex.has(message.type)) {
      this.typeIndex.set(message.type, new Set());
    }
    this.typeIndex.get(message.type)!.add(message.id);

    // Update time index
    const dateKey = message.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    if (dateKey) {
      if (!this.timeIndex.has(dateKey)) {
        this.timeIndex.set(dateKey, []);
      }
      this.timeIndex.get(dateKey)!.push(message.id);
    }
  }

  private removeFromIndexes(message: IncomingMessage): void {
    // Remove from chat index
    this.chatIndex.get(message.from)?.delete(message.id);
    if (message.to) {
      this.chatIndex.get(message.to)?.delete(message.id);
    }

    // Remove from type index
    this.typeIndex.get(message.type)?.delete(message.id);

    // Remove from time index
    const dateKey = message.timestamp.toISOString().split('T')[0];
    if (dateKey) {
      const timeMessages = this.timeIndex.get(dateKey);
      if (timeMessages) {
        const index = timeMessages.indexOf(message.id);
        if (index > -1) {
          timeMessages.splice(index, 1);
        }
      }
    }
  }

  private async evictOldest(): Promise<void> {
    if (this.messages.size === 0) {
      return;
    }

    // Find least recently accessed message
    let oldestEntry: CacheEntry | null = null;
    let oldestId = '';

    for (const [id, entry] of this.messages.entries()) {
      if (!oldestEntry || entry.lastAccessed < oldestEntry.lastAccessed) {
        oldestEntry = entry;
        oldestId = id;
      }
    }

    if (oldestId) {
      await this.delete(oldestId);
    }
  }

  // Additional utility methods
  getMessagesByType(type: MessageType): IncomingMessage[] {
    const messageIds = this.typeIndex.get(type);
    if (!messageIds) {
      return [];
    }

    return Array.from(messageIds)
      .map(id => this.messages.get(id))
      .filter((entry): entry is CacheEntry => entry !== undefined)
      .map(entry => ({ ...entry.message }));
  }

  getMessagesByDateRange(startDate: Date, endDate: Date): IncomingMessage[] {
    const results: IncomingMessage[] = [];
    
    for (const entry of this.messages.values()) {
      const message = entry.message;
      if (message.timestamp >= startDate && message.timestamp <= endDate) {
        results.push({ ...message });
      }
    }

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  getCacheInfo(): {
    size: number;
    maxSize: number;
    hitRate: number;
    indexSizes: {
      chat: number;
      type: number;
      time: number;
    };
  } {
    return {
      size: this.messages.size,
      maxSize: this.config.maxSize,
      hitRate: 0, // Would need to track hits/misses
      indexSizes: {
        chat: this.chatIndex.size,
        type: this.typeIndex.size,
        time: this.timeIndex.size
      }
    };
  }

  // Method needed by StorageManager
  getQueuedMessages(): IncomingMessage[] {
    return Array.from(this.messages.values()).map(entry => ({ ...entry.message }));
  }
}