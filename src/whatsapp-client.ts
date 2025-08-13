import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;

type WhatsAppClient = InstanceType<typeof Client>;
import path from 'path';
import fs from 'fs/promises';
import { AuthConfigManager, AuthStateManager, AuthState } from './auth/index.js';
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
  private authStateManager: AuthStateManager;

  constructor(config: WhatsAppConfig) {
    this.config = config;
    this.authStateManager = new AuthStateManager();
    
    const puppeteerConfig = AuthConfigManager.createPuppeteerConfig({
      userDataDir: config.userDataDir
    });
    const webVersionConfig = AuthConfigManager.createWebVersionConfig();
    
    this.client = new Client({
      authStrategy: new LocalAuth({ 
        clientId: config.sessionName,
        dataPath: config.userDataDir || AuthConfigManager.getDefaultSessionDir()
      }),
      puppeteer: puppeteerConfig,
      webVersionCache: webVersionConfig
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('qr', (qr: string) => {
      this.authStateManager.transitionTo(AuthState.WAITING_FOR_QR, {
        message: 'QR code required for authentication',
        reason: 'Session expired or invalid'
      });
      console.error('\n❌ WhatsApp session authentication required!');
      console.error('The saved session has expired or is invalid.');
      console.error('Please run "npm run auth" to re-authenticate.\n');
      this.lastError = 'Session authentication required - run "npm run auth"';
      throw new Error('Session authentication required - run "npm run auth"');
    });

    this.client.on('loading_screen', (percent: number, message: string) => {
      console.log(`Loading WhatsApp: ${percent}% - ${message}`);
      if (percent === 0) {
        this.authStateManager.transitionTo(AuthState.INITIALIZING, {
          message: 'Starting WhatsApp initialization',
          sessionName: this.config.sessionName
        });
      }
    });

    this.client.on('ready', () => {
      console.log('✅ WhatsApp client is ready!');
      this.isReady = true;
      this.lastConnected = new Date();
      this.lastError = null;
      
      // Get phone number if available
      if (this.client.info && this.client.info.wid) {
        this.phoneNumber = this.client.info.wid.user;
        console.log(`📱 Connected as: +${this.phoneNumber}`);
      }

      this.authStateManager.transitionTo(AuthState.READY, {
        message: 'WhatsApp client is ready',
        sessionName: this.config.sessionName,
        phoneNumber: this.phoneNumber || undefined
      });
    });

    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp client authenticated successfully (using saved session)');
      this.authStateManager.transitionTo(AuthState.AUTHENTICATED, {
        message: 'Authentication successful using saved session',
        sessionName: this.config.sessionName
      });
    });

    this.client.on('auth_failure', (msg: string) => {
      console.error('❌ WhatsApp authentication failed:', msg);
      this.lastError = `Authentication failed: ${msg}`;
      this.isReady = false;
      this.authStateManager.transitionTo(AuthState.FAILED, {
        error: `Authentication failed: ${msg}`,
        reason: msg
      });
    });

    this.client.on('disconnected', (reason: string) => {
      console.log('🔌 WhatsApp client disconnected:', reason);
      this.isReady = false;
      this.lastError = `Disconnected: ${reason}`;
      
      if (reason === 'LOGOUT') {
        console.log('⚠️  Session logged out. Run `npm run auth` to re-authenticate.');
      }

      this.authStateManager.transitionTo(AuthState.DISCONNECTED, {
        message: `Client disconnected: ${reason}`,
        reason: reason
      });
    });

    this.client.on('message', (message: any) => {
      // Log incoming messages for debugging
      if (process.env.DEBUG_MESSAGES === 'true') {
        console.log(`📥 Received message from ${message.from}: ${message.body}`);
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      this.authStateManager.transitionTo(AuthState.INITIALIZING, {
        message: 'Starting client initialization',
        sessionName: this.config.sessionName
      });

      // Check if we already have a session
      const sessionPath = path.join(this.config.userDataDir || './whatsapp_session', `session-${this.config.sessionName}`);
      const hasExistingSession = await fs.access(sessionPath).then(() => true).catch(() => false);
      
      if (!hasExistingSession) {
        this.authStateManager.transitionTo(AuthState.FAILED, {
          error: `No authenticated session found for '${this.config.sessionName}'. Please run "npm run auth" first.`,
          reason: 'Session not found'
        });
        throw new Error(`No authenticated session found for '${this.config.sessionName}'. Please run "npm run auth" first.`);
      }
      
      console.log(`💾 Loading existing session: '${this.config.sessionName}'`);
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
        
        // Also handle disconnection during initialization
        this.client.once('disconnected', (reason: string) => {
          clearTimeout(timeout);
          reject(new Error(`Disconnected during initialization: ${reason}`));
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
    const authState = this.authStateManager.getStateInfo();
    return {
      isConnected: this.isReady,
      isAuthenticated: this.isReady,
      sessionName: this.config.sessionName,
      phoneNumber: this.phoneNumber || undefined,
      lastConnected: this.lastConnected || undefined,
      error: this.lastError || undefined,
      authState: authState.state,
      authMessage: authState.message
    };
  }

  getAuthState(): AuthState {
    return this.authStateManager.getCurrentState();
  }

  getAuthStateInfo(): import('./auth/index.js').AuthStateInfo {
    return this.authStateManager.getStateInfo();
  }

  getAuthHistory(): import('./auth/index.js').AuthStateTransition[] {
    return this.authStateManager.getTransitionHistory();
  }

  onAuthStateChange(callback: (info: import('./auth/index.js').AuthStateInfo) => void): void {
    this.authStateManager.onAnyStateChange(callback);
  }

  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
    }
    this.isReady = false;
    this.authStateManager.transitionTo(AuthState.DESTROYED, {
      message: 'Client destroyed',
      reason: 'Manual destruction'
    });
  }
}