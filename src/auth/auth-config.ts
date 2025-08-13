import { AuthErrorMessages } from './auth-errors.js';

export interface AuthConfig {
  sessionDir: string;
  sessionPrefix: string;
  authTimeoutMs: number;
  qrCodeTimeout: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface PuppeteerConfig {
  headless: boolean;
  executablePath?: string;
  args: string[];
  userDataDir?: string;
}

export interface WebVersionConfig {
  type: 'remote';
  remotePath: string;
}

export class AuthConfigManager {
  private static readonly DEFAULT_AUTH_CONFIG: AuthConfig = {
    sessionDir: './whatsapp_session',
    sessionPrefix: 'session-',
    authTimeoutMs: 30000,
    qrCodeTimeout: 60000,
    maxRetries: 3,
    retryDelayMs: 5000,
  };

  private static readonly DEFAULT_PUPPETEER_CONFIG: PuppeteerConfig = {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  };

  private static readonly DEFAULT_WEB_VERSION_CONFIG: WebVersionConfig = {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  };

  static createAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
    return {
      ...this.DEFAULT_AUTH_CONFIG,
      ...this.loadFromEnvironment(),
      ...overrides
    };
  }

  static createPuppeteerConfig(overrides: Partial<PuppeteerConfig> = {}): PuppeteerConfig {
    return {
      ...this.DEFAULT_PUPPETEER_CONFIG,
      ...overrides
    };
  }

  static createWebVersionConfig(overrides: Partial<WebVersionConfig> = {}): WebVersionConfig {
    return {
      ...this.DEFAULT_WEB_VERSION_CONFIG,
      ...overrides
    };
  }

  private static loadFromEnvironment(): Partial<AuthConfig> {
    const envConfig: Partial<AuthConfig> = {};

    if (process.env.WHATSAPP_SESSION_DIR) {
      envConfig.sessionDir = process.env.WHATSAPP_SESSION_DIR;
    }

    if (process.env.WHATSAPP_SESSION_PREFIX) {
      envConfig.sessionPrefix = process.env.WHATSAPP_SESSION_PREFIX;
    }

    if (process.env.WHATSAPP_AUTH_TIMEOUT_MS) {
      const timeout = parseInt(process.env.WHATSAPP_AUTH_TIMEOUT_MS, 10);
      if (!isNaN(timeout)) {
        envConfig.authTimeoutMs = timeout;
      }
    }

    if (process.env.WHATSAPP_QR_TIMEOUT_MS) {
      const timeout = parseInt(process.env.WHATSAPP_QR_TIMEOUT_MS, 10);
      if (!isNaN(timeout)) {
        envConfig.qrCodeTimeout = timeout;
      }
    }

    if (process.env.WHATSAPP_MAX_RETRIES) {
      const retries = parseInt(process.env.WHATSAPP_MAX_RETRIES, 10);
      if (!isNaN(retries)) {
        envConfig.maxRetries = retries;
      }
    }

    if (process.env.WHATSAPP_RETRY_DELAY_MS) {
      const delay = parseInt(process.env.WHATSAPP_RETRY_DELAY_MS, 10);
      if (!isNaN(delay)) {
        envConfig.retryDelayMs = delay;
      }
    }

    return envConfig;
  }

  static getDefaultSessionDir(): string {
    return this.DEFAULT_AUTH_CONFIG.sessionDir;
  }

  static getDefaultSessionPrefix(): string {
    return this.DEFAULT_AUTH_CONFIG.sessionPrefix;
  }

  static validateConfig(config: AuthConfig): void {
    if (config.authTimeoutMs <= 0) {
      throw AuthErrorMessages.createConfigValidationFailed('authTimeoutMs', config.authTimeoutMs);
    }

    if (config.qrCodeTimeout <= 0) {
      throw AuthErrorMessages.createConfigValidationFailed('qrCodeTimeout', config.qrCodeTimeout);
    }

    if (config.maxRetries < 0) {
      throw AuthErrorMessages.createConfigValidationFailed('maxRetries', config.maxRetries);
    }

    if (config.retryDelayMs < 0) {
      throw AuthErrorMessages.createConfigValidationFailed('retryDelayMs', config.retryDelayMs);
    }

    if (!config.sessionDir || config.sessionDir.trim() === '') {
      throw AuthErrorMessages.createConfigValidationFailed('sessionDir', config.sessionDir);
    }

    if (!config.sessionPrefix || config.sessionPrefix.trim() === '') {
      throw AuthErrorMessages.createConfigValidationFailed('sessionPrefix', config.sessionPrefix);
    }
  }
}