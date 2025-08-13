import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;

type WhatsAppClient = InstanceType<typeof Client>;
import qrcode from 'qrcode-terminal';
import fs from 'fs/promises';
import type { 
  WhatsAppConfig, 
  AudioMessage, 
  TextMessage, 
  WhatsAppClientStatus, 
  Contact 
} from './types.js';

export class WhatsAppClientWrapper {
  private client: WhatsAppClient;
  private config: WhatsAppConfig;
  private isReady = false;
  private lastError: string | null = null;
  private phoneNumber: string | null = null;
  private lastConnected: Date | null = null;

  constructor(config: WhatsAppConfig) {
    this.config = config;
    
    this.client = new Client({
      authStrategy: new LocalAuth({ 
        clientId: config.sessionName,
        dataPath: config.userDataDir || './whatsapp_session'
      }),
      puppeteer: { 
        headless: true,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // Use system Chrome
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('qr', (qr: string) => {
      console.log('WhatsApp QR Code:');
      qrcode.generate(qr, { small: true });
      console.log('Scan the QR code above with your WhatsApp mobile app');
    });

    this.client.on('ready', () => {
      console.log('WhatsApp client is ready!');
      this.isReady = true;
      this.lastConnected = new Date();
      this.lastError = null;
      
      // Get phone number if available
      this.client.info.wid.user && (this.phoneNumber = this.client.info.wid.user);
    });

    this.client.on('authenticated', () => {
      console.log('WhatsApp client authenticated successfully');
    });

    this.client.on('auth_failure', (msg: string) => {
      console.error('WhatsApp authentication failed:', msg);
      this.lastError = `Authentication failed: ${msg}`;
      this.isReady = false;
    });

    this.client.on('disconnected', (reason: string) => {
      console.log('WhatsApp client disconnected:', reason);
      this.isReady = false;
      this.lastError = `Disconnected: ${reason}`;
    });

    this.client.on('message', (message: any) => {
      // Handle incoming messages if needed
      console.log(`Received message from ${message.from}: ${message.body}`);
    });
  }

  async initialize(): Promise<void> {
    try {
      console.log('Initializing WhatsApp client...');
      await this.client.initialize();
      
      // Wait for ready state with timeout
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Client initialization timed out after ${this.config.authTimeoutMs}ms`));
        }, this.config.authTimeoutMs);

        this.client.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.client.once('auth_failure', (msg: any) => {
          clearTimeout(timeout);
          reject(new Error(`Authentication failed: ${msg}`));
        });
      });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  async sendTextMessage(message: TextMessage): Promise<void> {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      await this.client.sendMessage(message.chatId, message.text);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  async sendAudioMessage(audioMessage: AudioMessage): Promise<void> {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      // Check if file exists
      await fs.access(audioMessage.filePath);
      
      const media = MessageMedia.fromFilePath(audioMessage.filePath);
      
      // If sending as voice note, set the appropriate type
      if (audioMessage.sendAsVoiceNote) {
        // WhatsApp Web.js automatically treats audio as voice notes
        // when the mimetype is audio and no caption is provided
        await this.client.sendMessage(audioMessage.chatId, media, {
          sendAudioAsVoice: true
        });
      } else {
        await this.client.sendMessage(audioMessage.chatId, media, {
          caption: audioMessage.caption
        });
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  async sendMediaFromUrl(chatId: string, url: string, caption?: string): Promise<void> {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const media = await MessageMedia.fromUrl(url);
      await this.client.sendMessage(chatId, media, { caption });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  async getContacts(): Promise<Contact[]> {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const contacts = await this.client.getContacts();
      return contacts.map((contact: any) => ({
        id: contact.id._serialized,
        name: contact.name,
        number: contact.number,
        pushname: contact.pushname,
        isGroup: contact.isGroup
      }));
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  async getChatById(chatId: string) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      return await this.client.getChatById(chatId);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  getStatus(): WhatsAppClientStatus {
    return {
      isConnected: this.isReady,
      isAuthenticated: this.isReady,
      sessionName: this.config.sessionName,
      phoneNumber: this.phoneNumber || undefined,
      lastConnected: this.lastConnected || undefined,
      error: this.lastError || undefined
    };
  }

  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
    }
    this.isReady = false;
  }
}