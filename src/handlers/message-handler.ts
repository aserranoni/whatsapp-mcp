import { WhatsAppEventEmitter } from './event-emitter.js';
import { RateLimiter } from './rate-limiter.js';
import { StorageManager } from '../storage/storage-manager.js';
import type { 
  IncomingMessage, 
  MessageFilter, 
  MessageHandlerConfig,
  MessageReceivingConfig,
  QuotedMessage,
  MessageEvent
} from '../types.js';
import { MessageType } from '../types.js';

export class MessageHandler extends WhatsAppEventEmitter {
  private messageQueue: IncomingMessage[] = [];
  private processedMessages: Set<string> = new Set();
  private rateLimiter: RateLimiter;
  private config: MessageHandlerConfig;
  private storageManager?: StorageManager;
  private isProcessing = false;

  constructor(config: MessageHandlerConfig) {
    super();
    this.config = config;
    this.rateLimiter = new RateLimiter(config.rateLimitPerMinute);
  }

  configureStorage(storageConfig: MessageReceivingConfig): void {
    this.storageManager = new StorageManager(storageConfig);
  }

  async initializeStorage(): Promise<void> {
    if (this.storageManager) {
      await this.storageManager.initialize();
    }
  }

  async processMessage(rawMessage: any): Promise<IncomingMessage> {
    try {
      // Check if we've already processed this message
      if (this.processedMessages.has(rawMessage.id._serialized)) {
        return this.convertToIncomingMessage(rawMessage);
      }

      // Apply rate limiting based on sender
      const senderId = rawMessage.from;
      if (!this.rateLimiter.isAllowed(senderId)) {
        this.emit('error', new Error(`Rate limit exceeded for sender: ${senderId}`));
        throw new Error(`Rate limit exceeded for sender: ${senderId}`);
      }

      // Convert WhatsApp Web.js message to our format
      const message = await this.convertToIncomingMessage(rawMessage);

      // Add to processed messages
      this.processedMessages.add(message.id);

      // Save to storage if configured
      if (this.config.enableStorage && this.storageManager) {
        await this.storageManager.save(message);
      }

      // Add to queue for local processing
      this.addToQueue(message);

      // Emit specific events based on message characteristics
      this.emitMessageEvents(message);

      return message;
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error('Unknown processing error'));
      throw error;
    }
  }

  private async convertToIncomingMessage(rawMessage: any): Promise<IncomingMessage> {
    // Determine message type
    const messageType = this.determineMessageType(rawMessage);
    
    // Extract quoted message if exists
    let quotedMessage: QuotedMessage | undefined;
    if (rawMessage.hasQuotedMsg) {
      const quoted = rawMessage._data.quotedMsg;
      if (quoted) {
        quotedMessage = {
          id: quoted.id._serialized || quoted.id,
          body: quoted.body || '',
          from: quoted.from || '',
          timestamp: new Date(quoted.t * 1000)
        };
      }
    }

    // Extract mentions
    const mentions = rawMessage.mentionedIds || [];

    return {
      id: rawMessage.id._serialized,
      from: rawMessage.from,
      to: rawMessage.to || '',
      body: rawMessage.body || '',
      type: messageType,
      timestamp: new Date(rawMessage.timestamp * 1000),
      isGroup: rawMessage.from.includes('@g.us'),
      author: rawMessage.author || rawMessage.from,
      hasMedia: rawMessage.hasMedia || false,
      mediaUrl: rawMessage.hasMedia ? await this.extractMediaUrl(rawMessage) : undefined,
      quotedMessage,
      mentions: mentions.length > 0 ? mentions : undefined,
      isForwarded: rawMessage.isForwarded || false,
      isStarred: rawMessage.isStarred || false,
      isRead: false // Will be updated when read status changes
    };
  }

  private determineMessageType(rawMessage: any): MessageType {
    if (rawMessage.hasMedia) {
      const mediaType = rawMessage.type;
      switch (mediaType) {
        case 'image':
          return MessageType.IMAGE;
        case 'audio':
        case 'ptt': // Push-to-talk (voice note)
          return MessageType.AUDIO;
        case 'video':
          return MessageType.VIDEO;
        case 'document':
          return MessageType.DOCUMENT;
        case 'sticker':
          return MessageType.STICKER;
        default:
          return MessageType.TEXT;
      }
    }

    if (rawMessage.type === 'location') {
      return MessageType.LOCATION;
    }

    if (rawMessage.type === 'vcard') {
      return MessageType.CONTACT;
    }

    // Check if message contains links
    const urlRegex = /https?:\/\/[^\s]+/gi;
    if (rawMessage.body && urlRegex.test(rawMessage.body)) {
      return MessageType.LINK;
    }

    return MessageType.TEXT;
  }

  private async extractMediaUrl(rawMessage: any): Promise<string | undefined> {
    try {
      if (rawMessage.hasMedia) {
        const media = await rawMessage.downloadMedia();
        // In a real implementation, you'd save this to a file or cloud storage
        // and return the URL. For now, we'll return a placeholder
        return `data:${media.mimetype};base64,${media.data}`;
      }
    } catch (error) {
      console.warn('Failed to extract media URL:', error);
    }
    return undefined;
  }

  private addToQueue(message: IncomingMessage): void {
    this.messageQueue.push(message);
    
    // Prevent memory issues by limiting queue size
    if (this.messageQueue.length > this.config.maxQueueSize) {
      this.messageQueue.shift(); // Remove oldest message
    }
  }

  private emitMessageEvents(message: IncomingMessage): void {
    // Emit general message event
    this.emit('message', message);

    // Emit specific events based on message characteristics
    if (message.hasMedia) {
      this.emit('media', message);
    } else {
      this.emit('text', message);
    }

    if (message.isGroup) {
      this.emit('group_message', message);
    } else {
      this.emit('private_message', message);
    }

    if (message.mentions && message.mentions.length > 0) {
      this.emit('mention', message);
    }

    if (message.quotedMessage) {
      this.emit('quoted_message', message);
    }

    if (message.isForwarded) {
      this.emit('forwarded_message', message);
    }
  }

  async filterMessages(filter: MessageFilter): Promise<IncomingMessage[]> {
    // Use storage if available for more comprehensive filtering
    if (this.storageManager) {
      return await this.storageManager.filter(filter);
    }

    // Fallback to in-memory queue
    return this.messageQueue.filter(message => {
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

  getQueuedMessages(): IncomingMessage[] {
    return [...this.messageQueue];
  }

  getProcessedMessageIds(): string[] {
    return Array.from(this.processedMessages);
  }

  clearQueue(): void {
    this.messageQueue = [];
  }

  clearProcessedMessages(): void {
    this.processedMessages.clear();
  }

  getRateLimitStatus(senderId: string): {
    remaining: number;
    resetTime: Date;
  } {
    return {
      remaining: this.rateLimiter.getRemainingRequests(senderId),
      resetTime: this.rateLimiter.getResetTime(senderId)
    };
  }

  async processQueuedMessages(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    
    try {
      // Process any queued messages that haven't been fully processed
      const unprocessedMessages = this.messageQueue.filter(
        msg => !this.processedMessages.has(msg.id)
      );

      for (const message of unprocessedMessages) {
        try {
          this.emitMessageEvents(message);
          this.processedMessages.add(message.id);
        } catch (error) {
          this.emit('error', error instanceof Error ? error : new Error('Queue processing error'));
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Mark message as read (to be called from external systems)
  markAsRead(messageId: string): boolean {
    const message = this.messageQueue.find(msg => msg.id === messageId);
    if (message) {
      message.isRead = true;
      this.emit('message_read', message);
      return true;
    }
    return false;
  }

  // Mark multiple messages as read
  markMultipleAsRead(messageIds: string[]): number {
    let readCount = 0;
    for (const messageId of messageIds) {
      if (this.markAsRead(messageId)) {
        readCount++;
      }
    }
    return readCount;
  }

  // Get statistics about processed messages
  async getStats(): Promise<{
    totalProcessed: number;
    queueSize: number;
    rateLimitedSenders: number;
    storageStats?: any;
  }> {
    const baseStats = {
      totalProcessed: this.processedMessages.size,
      queueSize: this.messageQueue.length,
      rateLimitedSenders: 0 // Would need to track this in rate limiter
    };

    if (this.storageManager) {
      const storageStats = await this.storageManager.getStats();
      return {
        ...baseStats,
        storageStats
      };
    }

    return baseStats;
  }

  // Storage management methods
  getStorageManager(): StorageManager | undefined {
    return this.storageManager;
  }

  async searchMessages(query: string): Promise<IncomingMessage[]> {
    if (this.storageManager) {
      return await this.storageManager.search(query);
    }

    // Fallback to basic queue search
    const searchTerm = query.toLowerCase();
    return this.messageQueue.filter(message => 
      message.body.toLowerCase().includes(searchTerm) ||
      message.from.toLowerCase().includes(searchTerm) ||
      message.author?.toLowerCase().includes(searchTerm)
    );
  }

  async getRecentMessages(limit: number): Promise<IncomingMessage[]> {
    if (this.storageManager) {
      return await this.storageManager.getRecent(limit);
    }

    return [...this.messageQueue]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getChatMessages(chatId: string, limit: number): Promise<IncomingMessage[]> {
    if (this.storageManager) {
      return await this.storageManager.getByChat(chatId, limit);
    }

    return this.messageQueue
      .filter(msg => msg.from === chatId || msg.to === chatId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getMessage(messageId: string): Promise<IncomingMessage | null> {
    if (this.storageManager) {
      return await this.storageManager.get(messageId);
    }

    return this.messageQueue.find(msg => msg.id === messageId) || null;
  }

  async closeStorage(): Promise<void> {
    if (this.storageManager) {
      await this.storageManager.close();
    }
  }
}