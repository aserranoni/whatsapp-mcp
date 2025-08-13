import type { IncomingMessage, MessageFilter } from '../types.js';

export interface MessageStore {
  save(message: IncomingMessage): Promise<void>;
  get(messageId: string): Promise<IncomingMessage | null>;
  getRecent(limit: number): Promise<IncomingMessage[]>;
  getByChat(chatId: string, limit: number): Promise<IncomingMessage[]>;
  search(query: string): Promise<IncomingMessage[]>;
  filter(filter: MessageFilter): Promise<IncomingMessage[]>;
  delete(messageId: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<MessageStoreStats>;
}

export interface MessageStoreStats {
  totalMessages: number;
  totalChats: number;
  oldestMessage?: Date;
  newestMessage?: Date;
  messagesByType: Record<string, number>;
  storageSize?: number; // in bytes
}

export interface MessageStoreConfig {
  maxSize: number;
  retentionDays: number;
  enableEncryption: boolean;
  encryptionKey?: string;
}

export abstract class BaseMessageStore implements MessageStore {
  protected config: MessageStoreConfig;

  constructor(config: MessageStoreConfig) {
    this.config = config;
  }

  abstract save(message: IncomingMessage): Promise<void>;
  abstract get(messageId: string): Promise<IncomingMessage | null>;
  abstract getRecent(limit: number): Promise<IncomingMessage[]>;
  abstract getByChat(chatId: string, limit: number): Promise<IncomingMessage[]>;
  abstract search(query: string): Promise<IncomingMessage[]>;
  abstract filter(filter: MessageFilter): Promise<IncomingMessage[]>;
  abstract delete(messageId: string): Promise<void>;
  abstract clear(): Promise<void>;
  abstract getStats(): Promise<MessageStoreStats>;

  protected filterMessages(messages: IncomingMessage[], filter: MessageFilter): IncomingMessage[] {
    return messages.filter(message => {
      if (filter.chatId && message.from !== filter.chatId && message.to !== filter.chatId) {
        return false;
      }

      if (filter.type && message.type !== filter.type) {
        return false;
      }

      if (filter.from && message.from !== filter.from) {
        return false;
      }

      if (filter.startDate && message.timestamp < filter.startDate) {
        return false;
      }

      if (filter.endDate && message.timestamp > filter.endDate) {
        return false;
      }

      if (filter.isUnread !== undefined && message.isRead !== !filter.isUnread) {
        return false;
      }

      if (filter.hasMedia !== undefined && message.hasMedia !== filter.hasMedia) {
        return false;
      }

      if (filter.searchText && !message.body.toLowerCase().includes(filter.searchText.toLowerCase())) {
        return false;
      }

      return true;
    });
  }

  protected shouldRetainMessage(message: IncomingMessage): boolean {
    if (this.config.retentionDays <= 0) {
      return true; // No retention limit
    }

    const retentionLimit = new Date();
    retentionLimit.setDate(retentionLimit.getDate() - this.config.retentionDays);
    
    return message.timestamp >= retentionLimit;
  }

  protected encryptData(data: string): string {
    if (!this.config.enableEncryption || !this.config.encryptionKey) {
      return data;
    }
    
    // Simple XOR encryption (in production, use proper encryption)
    const key = this.config.encryptionKey;
    let encrypted = '';
    
    for (let i = 0; i < data.length; i++) {
      encrypted += String.fromCharCode(
        data.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    
    return Buffer.from(encrypted).toString('base64');
  }

  protected decryptData(encryptedData: string): string {
    if (!this.config.enableEncryption || !this.config.encryptionKey) {
      return encryptedData;
    }
    
    try {
      const data = Buffer.from(encryptedData, 'base64').toString();
      const key = this.config.encryptionKey;
      let decrypted = '';
      
      for (let i = 0; i < data.length; i++) {
        decrypted += String.fromCharCode(
          data.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
      }
      
      return decrypted;
    } catch (error) {
      console.warn('Failed to decrypt data:', error);
      return encryptedData;
    }
  }
}