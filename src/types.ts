export interface WhatsAppConfig {
  sessionName: string;
  qrCodeTimeout: number;
  authTimeoutMs: number;
  userDataDir?: string;
}

export interface AudioMessage {
  filePath: string;
  chatId: string;
  caption?: string;
  sendAsVoiceNote?: boolean;
}

export interface TextMessage {
  text: string;
  chatId: string;
}

export interface WhatsAppClientStatus {
  isConnected: boolean;
  isAuthenticated: boolean;
  sessionName: string;
  phoneNumber?: string;
  lastConnected?: Date;
  error?: string;
}

export interface Contact {
  id: string;
  name?: string;
  number: string;
  pushname?: string;
  isGroup: boolean;
}

export interface TTSRequest {
  text: string;
  chatId: string;
  voiceName?: string;
  speed?: number;
  pitch?: number;
}

export interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// Re-export message types for easy access
export * from './types/messages.js';