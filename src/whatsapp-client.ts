import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;

type WhatsAppClient = InstanceType<typeof Client>;
import path from 'path';
import fs from 'fs/promises';
import { 
  AuthConfigManager, 
  AuthStateManager, 
  AuthState, 
  AuthStrategyManager,
  AuthErrorMessages,
  logAuthError,
  type AuthContext
} from './auth/index.js';
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
  private authStrategyManager: AuthStrategyManager;
  private authConfig: import('./auth/index.js').AuthConfig;

  constructor(config: WhatsAppConfig) {
    this.config = config;
    this.authStateManager = new AuthStateManager();
    
    // Create auth configuration
    this.authConfig = AuthConfigManager.createAuthConfig({
      authTimeoutMs: config.authTimeoutMs,
      qrCodeTimeout: config.qrCodeTimeout,
      sessionDir: config.userDataDir || AuthConfigManager.getDefaultSessionDir()
    });
    AuthConfigManager.validateConfig(this.authConfig);

    // Create auth context for strategies
    const authContext: AuthContext = {
      config: this.authConfig,
      stateManager: this.authStateManager,
      sessionName: config.sessionName,
      userDataDir: config.userDataDir || AuthConfigManager.getDefaultSessionDir()
    };

    // Initialize auth strategy manager
    this.authStrategyManager = new AuthStrategyManager(authContext);
    
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
      const error = AuthErrorMessages.createSessionExpired(this.config.sessionName);
      logAuthError(error, 'QR Event');
      this.lastError = error.message;
      throw error;
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
      const error = AuthErrorMessages.createAuthenticationFailed(msg, this.config.sessionName);
      logAuthError(error, 'Auth Failure');
      this.lastError = error.message;
      this.isReady = false;
      this.authStateManager.transitionTo(AuthState.FAILED, {
        error: error.message,
        reason: msg
      });
    });

    this.client.on('disconnected', (reason: string) => {
      const error = AuthErrorMessages.createClientDisconnected(reason, this.config.sessionName);
      logAuthError(error, 'Disconnected');
      this.isReady = false;
      this.lastError = error.message;

      this.authStateManager.transitionTo(AuthState.DISCONNECTED, {
        message: error.message,
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

      // Use auth strategy manager to determine authentication approach
      const authResult = await this.authStrategyManager.authenticate();
      
      if (!authResult.success) {
        if (authResult.requiresQr) {
          // QR code required - this is handled by the event handlers
          throw AuthErrorMessages.createQrCodeRequired(this.config.sessionName);
        } else {
          // Other authentication failure
          const error = AuthErrorMessages.createAuthenticationFailed(
            authResult.error || 'Unknown authentication error',
            this.config.sessionName
          );
          this.authStateManager.transitionTo(AuthState.FAILED, {
            error: error.message,
            reason: authResult.error || 'Unknown authentication error'
          });
          throw error;
        }
      }
      
      console.log(`💾 Loading session: '${this.config.sessionName}'`);
      console.log('Initializing WhatsApp client...');
      await this.client.initialize();
      
      // Wait for ready state with timeout
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const error = AuthErrorMessages.createInitializationTimeout(
            this.authConfig.authTimeoutMs,
            this.config.sessionName
          );
          reject(error);
        }, this.authConfig.authTimeoutMs);

        this.client.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.client.once('auth_failure', (msg: any) => {
          clearTimeout(timeout);
          reject(AuthErrorMessages.createAuthenticationFailed(msg, this.config.sessionName));
        });
        
        // Also handle disconnection during initialization
        this.client.once('disconnected', (reason: string) => {
          clearTimeout(timeout);
          reject(AuthErrorMessages.createClientDisconnected(reason, this.config.sessionName));
        });
      });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      logAuthError(error instanceof Error ? error : new Error('Unknown error'), 'Initialize');
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

  getAuthStrategies(): string[] {
    return this.authStrategyManager.getAvailableStrategies();
  }

  async getRecommendedAuthStrategy(): Promise<string> {
    return await this.authStrategyManager.getRecommendedStrategy();
  }

  getAuthConfig(): import('./auth/index.js').AuthConfig {
    return { ...this.authConfig };
  }

  async destroy(): Promise<void> {
    try {
      await this.authStrategyManager.cleanup();
    } catch (error) {
      console.warn('Error during auth strategy cleanup:', error);
    }

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