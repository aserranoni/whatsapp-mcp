import { 
  AuthConfigManager, 
  AuthStateManager, 
  AuthState, 
  AuthError,
  AuthErrorMessages,
  AuthErrorCode,
  isAuthError
} from '../auth/index.js';

describe('Auth Configuration', () => {
  test('should create default auth config', () => {
    const config = AuthConfigManager.createAuthConfig();
    
    expect(config.sessionDir).toBe('./whatsapp_session');
    expect(config.sessionPrefix).toBe('session-');
    expect(config.authTimeoutMs).toBe(30000);
    expect(config.qrCodeTimeout).toBe(60000);
    expect(config.maxRetries).toBe(3);
    expect(config.retryDelayMs).toBe(5000);
  });

  test('should create auth config with overrides', () => {
    const config = AuthConfigManager.createAuthConfig({
      authTimeoutMs: 60000,
      sessionDir: '/custom/path'
    });
    
    expect(config.authTimeoutMs).toBe(60000);
    expect(config.sessionDir).toBe('/custom/path');
    expect(config.sessionPrefix).toBe('session-'); // default
  });

  test('should validate auth config', () => {
    const validConfig = AuthConfigManager.createAuthConfig();
    expect(() => AuthConfigManager.validateConfig(validConfig)).not.toThrow();
  });

  test('should reject invalid auth config', () => {
    expect(() => {
      AuthConfigManager.validateConfig({
        sessionDir: '',
        sessionPrefix: 'session-',
        authTimeoutMs: -1,
        qrCodeTimeout: 60000,
        maxRetries: 3,
        retryDelayMs: 5000
      });
    }).toThrow(AuthError);
  });
});

describe('Auth State Management', () => {
  let stateManager: AuthStateManager;

  beforeEach(() => {
    stateManager = new AuthStateManager();
  });

  test('should start in UNINITIALIZED state', () => {
    expect(stateManager.getCurrentState()).toBe(AuthState.UNINITIALIZED);
  });

  test('should transition through valid states', () => {
    expect(() => {
      stateManager.transitionTo(AuthState.INITIALIZING);
    }).not.toThrow();
    
    expect(stateManager.getCurrentState()).toBe(AuthState.INITIALIZING);
  });

  test('should reject invalid state transitions', () => {
    expect(() => {
      stateManager.transitionTo(AuthState.READY); // Can't go directly from UNINITIALIZED to READY
    }).toThrow(AuthError);
  });

  test('should track state history', () => {
    stateManager.transitionTo(AuthState.INITIALIZING);
    stateManager.transitionTo(AuthState.AUTHENTICATING);
    stateManager.transitionTo(AuthState.AUTHENTICATED);
    
    const history = stateManager.getTransitionHistory();
    expect(history).toHaveLength(3);
    expect(history[0]!.from).toBe(AuthState.UNINITIALIZED);
    expect(history[0]!.to).toBe(AuthState.INITIALIZING);
    expect(history[1]!.from).toBe(AuthState.INITIALIZING);
    expect(history[1]!.to).toBe(AuthState.AUTHENTICATING);
    expect(history[2]!.from).toBe(AuthState.AUTHENTICATING);
    expect(history[2]!.to).toBe(AuthState.AUTHENTICATED);
  });

  test('should provide state info', () => {
    stateManager.transitionTo(AuthState.INITIALIZING, {
      message: 'Test message',
      sessionName: 'test-session'
    });
    
    const info = stateManager.getStateInfo();
    expect(info.state).toBe(AuthState.INITIALIZING);
    expect(info.message).toBe('Test message');
    expect(info.sessionName).toBe('test-session');
  });
});

describe('Auth Error Handling', () => {
  test('should create session not found error', () => {
    const error = AuthErrorMessages.createSessionNotFound('test-session');
    
    expect(error).toBeInstanceOf(AuthError);
    expect(error.code).toBe(AuthErrorCode.SESSION_NOT_FOUND);
    expect(error.sessionName).toBe('test-session');
    expect(error.recoverable).toBe(true);
    expect(error.suggestedAction).toContain('npm run auth');
  });

  test('should create authentication failed error', () => {
    const error = AuthErrorMessages.createAuthenticationFailed('Invalid credentials', 'test-session');
    
    expect(error.code).toBe(AuthErrorCode.AUTHENTICATION_FAILED);
    expect(error.details).toBe('Invalid credentials');
    expect(error.sessionName).toBe('test-session');
  });

  test('should identify auth errors', () => {
    const authError = AuthErrorMessages.createSessionNotFound();
    const genericError = new Error('Generic error');
    
    expect(isAuthError(authError)).toBe(true);
    expect(isAuthError(genericError)).toBe(false);
  });

  test('should serialize auth errors to JSON', () => {
    const error = AuthErrorMessages.createQrCodeRequired('test-session');
    const json = error.toJSON();
    
    expect(json.code).toBe(AuthErrorCode.QR_CODE_REQUIRED);
    expect(json.sessionName).toBe('test-session');
    expect(json.recoverable).toBe(true);
  });

  test('should create config validation errors', () => {
    const error = AuthErrorMessages.createConfigValidationFailed('authTimeoutMs', -1);
    
    expect(error.code).toBe(AuthErrorCode.CONFIG_VALIDATION_FAILED);
    expect(error.details).toContain('authTimeoutMs');
    expect(error.details).toContain('-1');
  });
});

describe('Puppeteer Configuration', () => {
  test('should create default puppeteer config', () => {
    const config = AuthConfigManager.createPuppeteerConfig();
    
    expect(config.headless).toBe(true);
    expect(config.args).toContain('--no-sandbox');
    expect(config.args).toContain('--disable-setuid-sandbox');
  });

  test('should create puppeteer config with overrides', () => {
    const config = AuthConfigManager.createPuppeteerConfig({
      headless: false,
      userDataDir: '/custom/data'
    });
    
    expect(config.headless).toBe(false);
    expect(config.userDataDir).toBe('/custom/data');
  });
});

describe('Web Version Configuration', () => {
  test('should create default web version config', () => {
    const config = AuthConfigManager.createWebVersionConfig();
    
    expect(config.type).toBe('remote');
    expect(config.remotePath).toContain('wa-version');
  });

  test('should create web version config with overrides', () => {
    const config = AuthConfigManager.createWebVersionConfig({
      remotePath: 'https://custom.path/version.html'
    });
    
    expect(config.type).toBe('remote');
    expect(config.remotePath).toBe('https://custom.path/version.html');
  });
});