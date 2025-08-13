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

export interface MessageHandlerConfig {
  rateLimitPerMinute: number;
  enableStorage: boolean;
  enableWebhooks: boolean;
  maxQueueSize: number;
}

export interface MessageReceivingConfig {
  enableMessageHistory: boolean;
  enableWebhooks: boolean;
  enableAutoResponse: boolean;
  
  storageType: 'memory' | 'sqlite' | 'both';
  maxHistorySize: number;
  persistMessages: boolean;
  storageLocation?: string;
  retentionDays: number;
  
  autoDownloadMedia: boolean;
  maxMediaSize: number;
  mediaStoragePath: string;
  
  rateLimitPerMinute: number;
  maxConcurrentProcessing: number;
  messageQueueSize: number;
  
  encryptStorage: boolean;
  allowedSenders?: string[];
  blockedSenders?: string[];
  privacyMode: boolean;
  
  webhookUrl?: string;
  webhookSecret?: string;
  webhookRetries: number;
  webhookTimeout: number;
}

export interface AutoResponseRule {
  trigger: string;
  response: string;
  chatIds?: string[];
  isRegex?: boolean;
  caseSensitive?: boolean;
}

export interface WebhookPayload {
  event: MessageEvent;
  messageId: string;
  chatId: string;
  timestamp: Date;
  signature: string;
}