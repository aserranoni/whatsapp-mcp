import { AuthStateManager, AuthState } from './auth-state.js';
import { AuthConfig } from './auth-config.js';

export interface AuthenticationResult {
  success: boolean;
  sessionName?: string;
  phoneNumber?: string;
  error?: string;
  requiresQr?: boolean;
}

export interface AuthContext {
  config: AuthConfig;
  stateManager: AuthStateManager;
  sessionName: string;
  userDataDir: string;
}

export abstract class AuthStrategy {
  protected context: AuthContext;

  constructor(context: AuthContext) {
    this.context = context;
  }

  abstract authenticate(): Promise<AuthenticationResult>;
  abstract canHandle(): Promise<boolean>;
  abstract getStrategyName(): string;
  abstract cleanup(): Promise<void>;
}

export class SessionRestoreStrategy extends AuthStrategy {
  getStrategyName(): string {
    return 'session-restore';
  }

  async canHandle(): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const sessionPath = path.default.join(
        this.context.userDataDir, 
        `session-${this.context.sessionName}`
      );
      
      await fs.default.access(sessionPath);
      return true;
    } catch {
      return false;
    }
  }

  async authenticate(): Promise<AuthenticationResult> {
    this.context.stateManager.transitionTo(AuthState.AUTHENTICATING, {
      message: 'Restoring from existing session',
      sessionName: this.context.sessionName
    });

    try {
      // Session exists, authentication should proceed automatically
      // The actual authentication is handled by whatsapp-web.js
      console.log(`🔄 Using existing session: ${this.context.sessionName}`);
      
      return {
        success: true,
        sessionName: this.context.sessionName
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.context.stateManager.transitionTo(AuthState.FAILED, {
        error: `Session restore failed: ${errorMessage}`,
        reason: errorMessage
      });

      return {
        success: false,
        error: `Session restore failed: ${errorMessage}`
      };
    }
  }

  async cleanup(): Promise<void> {
    // No cleanup needed for session restore
  }
}

export class QrCodeStrategy extends AuthStrategy {
  getStrategyName(): string {
    return 'qr-code';
  }

  async canHandle(): Promise<boolean> {
    // QR code strategy can always handle authentication as fallback
    return true;
  }

  async authenticate(): Promise<AuthenticationResult> {
    this.context.stateManager.transitionTo(AuthState.WAITING_FOR_QR, {
      message: 'QR code authentication required',
      sessionName: this.context.sessionName
    });

    console.log('📱 QR Code authentication required');
    console.log('Please run "npm run auth" to scan QR code and authenticate');

    return {
      success: false,
      requiresQr: true,
      error: 'QR code authentication required - run "npm run auth"'
    };
  }

  async cleanup(): Promise<void> {
    // No cleanup needed for QR code strategy
  }
}

export class AuthStrategyManager {
  private strategies: AuthStrategy[] = [];
  private context: AuthContext;

  constructor(context: AuthContext) {
    this.context = context;
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    // Order matters - try session restore first, fall back to QR code
    this.strategies = [
      new SessionRestoreStrategy(this.context),
      new QrCodeStrategy(this.context)
    ];
  }

  async selectStrategy(): Promise<AuthStrategy> {
    for (const strategy of this.strategies) {
      if (await strategy.canHandle()) {
        console.log(`🔐 Selected authentication strategy: ${strategy.getStrategyName()}`);
        return strategy;
      }
    }

    // Fallback to QR code if no strategy can handle
    const qrStrategy = this.strategies.find(s => s instanceof QrCodeStrategy);
    if (qrStrategy) {
      console.log('🔐 Falling back to QR code authentication');
      return qrStrategy;
    }

    throw new Error('No suitable authentication strategy found');
  }

  async authenticate(): Promise<AuthenticationResult> {
    try {
      const strategy = await this.selectStrategy();
      const result = await strategy.authenticate();
      
      if (result.success) {
        console.log(`✅ Authentication successful using ${strategy.getStrategyName()}`);
      } else {
        console.log(`❌ Authentication failed using ${strategy.getStrategyName()}: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.context.stateManager.transitionTo(AuthState.FAILED, {
        error: `Authentication strategy selection failed: ${errorMessage}`,
        reason: errorMessage
      });

      return {
        success: false,
        error: `Authentication strategy selection failed: ${errorMessage}`
      };
    }
  }

  async cleanup(): Promise<void> {
    await Promise.all(this.strategies.map(strategy => strategy.cleanup()));
  }

  getAvailableStrategies(): string[] {
    return this.strategies.map(strategy => strategy.getStrategyName());
  }

  async getRecommendedStrategy(): Promise<string> {
    const strategy = await this.selectStrategy();
    return strategy.getStrategyName();
  }
}