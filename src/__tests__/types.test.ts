import { describe, it, expect } from '@jest/globals';
import type { WhatsAppConfig, TextMessage, AudioMessage } from '../types.js';

describe('Type Definitions', () => {
  it('should validate WhatsAppConfig interface', () => {
    const config: WhatsAppConfig = {
      sessionName: 'test-session',
      qrCodeTimeout: 60000,
      authTimeoutMs: 60000,
      userDataDir: './test-session',
    };

    expect(config.sessionName).toBe('test-session');
    expect(config.qrCodeTimeout).toBe(60000);
    expect(config.authTimeoutMs).toBe(60000);
    expect(config.userDataDir).toBe('./test-session');
  });

  it('should validate TextMessage interface', () => {
    const message: TextMessage = {
      chatId: '5511999999999@c.us',
      text: 'Hello World',
    };

    expect(message.chatId).toBe('5511999999999@c.us');
    expect(message.text).toBe('Hello World');
  });

  it('should validate AudioMessage interface with required fields', () => {
    const message: AudioMessage = {
      chatId: '5511999999999@c.us',
      filePath: '/path/to/audio.mp3',
    };

    expect(message.chatId).toBe('5511999999999@c.us');
    expect(message.filePath).toBe('/path/to/audio.mp3');
  });

  it('should validate AudioMessage interface with all fields', () => {
    const message: AudioMessage = {
      chatId: '5511999999999@c.us',
      filePath: '/path/to/audio.mp3',
      caption: 'Audio message',
      sendAsVoiceNote: true,
    };

    expect(message.chatId).toBe('5511999999999@c.us');
    expect(message.filePath).toBe('/path/to/audio.mp3');
    expect(message.caption).toBe('Audio message');
    expect(message.sendAsVoiceNote).toBe(true);
  });
});