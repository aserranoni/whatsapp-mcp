import { EventEmitter } from 'events';
import type { IncomingMessage, MessageEvent } from '../types.js';

export interface MessageEventEmitter extends EventEmitter {
  on(event: 'message', listener: (message: IncomingMessage) => void): this;
  on(event: 'media', listener: (message: IncomingMessage) => void): this;
  on(event: 'text', listener: (message: IncomingMessage) => void): this;
  on(event: 'group_message', listener: (message: IncomingMessage) => void): this;
  on(event: 'private_message', listener: (message: IncomingMessage) => void): this;
  on(event: 'mention', listener: (message: IncomingMessage) => void): this;
  on(event: 'quoted_message', listener: (message: IncomingMessage) => void): this;
  on(event: 'forwarded_message', listener: (message: IncomingMessage) => void): this;
  on(event: 'message_read', listener: (message: IncomingMessage) => void): this;
  on(event: 'message_deleted', listener: (message: IncomingMessage) => void): this;
  on(event: 'typing_start', listener: (chatId: string) => void): this;
  on(event: 'typing_stop', listener: (chatId: string) => void): this;
  on(event: 'presence_update', listener: (chatId: string, presence: string) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;

  emit(event: 'message', message: IncomingMessage): boolean;
  emit(event: 'media', message: IncomingMessage): boolean;
  emit(event: 'text', message: IncomingMessage): boolean;
  emit(event: 'group_message', message: IncomingMessage): boolean;
  emit(event: 'private_message', message: IncomingMessage): boolean;
  emit(event: 'mention', message: IncomingMessage): boolean;
  emit(event: 'quoted_message', message: IncomingMessage): boolean;
  emit(event: 'forwarded_message', message: IncomingMessage): boolean;
  emit(event: 'message_read', message: IncomingMessage): boolean;
  emit(event: 'message_deleted', message: IncomingMessage): boolean;
  emit(event: 'typing_start', chatId: string): boolean;
  emit(event: 'typing_stop', chatId: string): boolean;
  emit(event: 'presence_update', chatId: string, presence: string): boolean;
  emit(event: 'error', error: Error): boolean;
}

export class WhatsAppEventEmitter extends EventEmitter implements MessageEventEmitter {
  constructor() {
    super();
    // Set max listeners to handle many concurrent operations
    this.setMaxListeners(100);
  }

  // Helper methods for common event patterns
  onMessage(callback: (msg: IncomingMessage) => void): void {
    this.on('message', callback);
  }

  onMediaMessage(callback: (msg: IncomingMessage) => void): void {
    this.on('media', callback);
  }

  onTextMessage(callback: (msg: IncomingMessage) => void): void {
    this.on('text', callback);
  }

  onGroupMessage(callback: (msg: IncomingMessage) => void): void {
    this.on('group_message', callback);
  }

  onPrivateMessage(callback: (msg: IncomingMessage) => void): void {
    this.on('private_message', callback);
  }

  onMention(callback: (msg: IncomingMessage) => void): void {
    this.on('mention', callback);
  }

  onQuotedMessage(callback: (msg: IncomingMessage) => void): void {
    this.on('quoted_message', callback);
  }

  onForwardedMessage(callback: (msg: IncomingMessage) => void): void {
    this.on('forwarded_message', callback);
  }

  onError(callback: (error: Error) => void): void {
    this.on('error', callback);
  }

  // Convenience method to remove all listeners for a specific event
  removeAllListenersForEvent(event: string): void {
    this.removeAllListeners(event);
  }

  // Get current listener count for debugging
  getListenerCount(event: string): number {
    return this.listenerCount(event);
  }

  // Get all registered event names
  getEventNames(): string[] {
    return this.eventNames() as string[];
  }
}