export enum AuthErrorCode {
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  QR_CODE_REQUIRED = 'QR_CODE_REQUIRED',
  INITIALIZATION_TIMEOUT = 'INITIALIZATION_TIMEOUT',
  STRATEGY_SELECTION_FAILED = 'STRATEGY_SELECTION_FAILED',
  CONFIG_VALIDATION_FAILED = 'CONFIG_VALIDATION_FAILED',
  CLIENT_DISCONNECTED = 'CLIENT_DISCONNECTED',
  DESTROY_FAILED = 'DESTROY_FAILED',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION'
}

export interface AuthErrorInfo {
  code: AuthErrorCode;
  message: string;
  details?: string;
  sessionName?: string;
  suggestedAction?: string;
  recoverable?: boolean;
}

export class AuthError extends Error {
  public readonly code: AuthErrorCode;
  public readonly details?: string;
  public readonly sessionName?: string;
  public readonly suggestedAction?: string;
  public readonly recoverable: boolean;

  constructor(info: AuthErrorInfo) {
    super(info.message);
    this.name = 'AuthError';
    this.code = info.code;
    this.details = info.details;
    this.sessionName = info.sessionName;
    this.suggestedAction = info.suggestedAction;
    this.recoverable = info.recoverable || false;
  }

  toJSON(): AuthErrorInfo {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      sessionName: this.sessionName,
      suggestedAction: this.suggestedAction,
      recoverable: this.recoverable
    };
  }
}

export class AuthErrorMessages {
  static readonly MESSAGES: Record<AuthErrorCode, (context?: any) => AuthErrorInfo> = {
    [AuthErrorCode.SESSION_NOT_FOUND]: (context?: { sessionName?: string }) => ({
      code: AuthErrorCode.SESSION_NOT_FOUND,
      message: `No authenticated WhatsApp session found${context?.sessionName ? ` for '${context.sessionName}'` : ''}`,
      details: 'The session directory does not exist or contains no valid session data',
      sessionName: context?.sessionName,
      suggestedAction: 'Run "npm run auth" to authenticate and create a new session',
      recoverable: true
    }),

    [AuthErrorCode.SESSION_EXPIRED]: (context?: { sessionName?: string }) => ({
      code: AuthErrorCode.SESSION_EXPIRED,
      message: `WhatsApp session has expired${context?.sessionName ? ` for '${context.sessionName}'` : ''}`,
      details: 'The saved session is no longer valid and requires re-authentication',
      sessionName: context?.sessionName,
      suggestedAction: 'Run "npm run auth" to re-authenticate with a new QR code',
      recoverable: true
    }),

    [AuthErrorCode.AUTHENTICATION_FAILED]: (context?: { reason?: string; sessionName?: string }) => ({
      code: AuthErrorCode.AUTHENTICATION_FAILED,
      message: `WhatsApp authentication failed${context?.sessionName ? ` for '${context.sessionName}'` : ''}`,
      details: context?.reason || 'Authentication process encountered an error',
      sessionName: context?.sessionName,
      suggestedAction: 'Clear session data and run "npm run auth" to re-authenticate',
      recoverable: true
    }),

    [AuthErrorCode.QR_CODE_REQUIRED]: (context?: { sessionName?: string }) => ({
      code: AuthErrorCode.QR_CODE_REQUIRED,
      message: 'QR code authentication required',
      details: 'No valid session found, QR code scanning is needed to authenticate',
      sessionName: context?.sessionName,
      suggestedAction: 'Run "npm run auth" and scan the QR code with your WhatsApp mobile app',
      recoverable: true
    }),

    [AuthErrorCode.INITIALIZATION_TIMEOUT]: (context?: { timeoutMs?: number; sessionName?: string }) => ({
      code: AuthErrorCode.INITIALIZATION_TIMEOUT,
      message: `Client initialization timed out${context?.timeoutMs ? ` after ${context.timeoutMs}ms` : ''}`,
      details: 'WhatsApp client failed to initialize within the expected time frame',
      sessionName: context?.sessionName,
      suggestedAction: 'Check network connection and try again, or increase timeout in configuration',
      recoverable: true
    }),

    [AuthErrorCode.STRATEGY_SELECTION_FAILED]: (context?: { reason?: string }) => ({
      code: AuthErrorCode.STRATEGY_SELECTION_FAILED,
      message: 'Failed to select authentication strategy',
      details: context?.reason || 'No suitable authentication method could be determined',
      suggestedAction: 'Ensure session directory exists and is accessible, or run "npm run auth"',
      recoverable: true
    }),

    [AuthErrorCode.CONFIG_VALIDATION_FAILED]: (context?: { field?: string; value?: any }) => ({
      code: AuthErrorCode.CONFIG_VALIDATION_FAILED,
      message: 'Authentication configuration validation failed',
      details: context?.field ? `Invalid value for ${context.field}: ${context.value}` : 'Configuration contains invalid values',
      suggestedAction: 'Check configuration parameters and environment variables',
      recoverable: true
    }),

    [AuthErrorCode.CLIENT_DISCONNECTED]: (context?: { reason?: string; sessionName?: string }) => ({
      code: AuthErrorCode.CLIENT_DISCONNECTED,
      message: `WhatsApp client disconnected${context?.sessionName ? ` for '${context.sessionName}'` : ''}`,
      details: context?.reason || 'Client connection was lost',
      sessionName: context?.sessionName,
      suggestedAction: context?.reason === 'LOGOUT' 
        ? 'Run "npm run auth" to re-authenticate' 
        : 'Check network connection and retry initialization',
      recoverable: context?.reason !== 'LOGOUT'
    }),

    [AuthErrorCode.DESTROY_FAILED]: (context?: { reason?: string }) => ({
      code: AuthErrorCode.DESTROY_FAILED,
      message: 'Failed to properly destroy WhatsApp client',
      details: context?.reason || 'Error occurred during client cleanup',
      suggestedAction: 'Client may need manual cleanup, restart the application',
      recoverable: false
    }),

    [AuthErrorCode.INVALID_STATE_TRANSITION]: (context?: { from?: string; to?: string }) => ({
      code: AuthErrorCode.INVALID_STATE_TRANSITION,
      message: `Invalid authentication state transition${context?.from && context?.to ? ` from ${context.from} to ${context.to}` : ''}`,
      details: 'Attempted state transition is not allowed by the authentication state machine',
      suggestedAction: 'This indicates a programming error, please report this issue',
      recoverable: false
    })
  };

  static create(code: AuthErrorCode, context?: any): AuthError {
    const errorInfo = this.MESSAGES[code](context);
    return new AuthError(errorInfo);
  }

  static createSessionNotFound(sessionName?: string): AuthError {
    return this.create(AuthErrorCode.SESSION_NOT_FOUND, { sessionName });
  }

  static createSessionExpired(sessionName?: string): AuthError {
    return this.create(AuthErrorCode.SESSION_EXPIRED, { sessionName });
  }

  static createAuthenticationFailed(reason?: string, sessionName?: string): AuthError {
    return this.create(AuthErrorCode.AUTHENTICATION_FAILED, { reason, sessionName });
  }

  static createQrCodeRequired(sessionName?: string): AuthError {
    return this.create(AuthErrorCode.QR_CODE_REQUIRED, { sessionName });
  }

  static createInitializationTimeout(timeoutMs?: number, sessionName?: string): AuthError {
    return this.create(AuthErrorCode.INITIALIZATION_TIMEOUT, { timeoutMs, sessionName });
  }

  static createConfigValidationFailed(field?: string, value?: any): AuthError {
    return this.create(AuthErrorCode.CONFIG_VALIDATION_FAILED, { field, value });
  }

  static createClientDisconnected(reason?: string, sessionName?: string): AuthError {
    return this.create(AuthErrorCode.CLIENT_DISCONNECTED, { reason, sessionName });
  }

  static createInvalidStateTransition(from?: string, to?: string): AuthError {
    return this.create(AuthErrorCode.INVALID_STATE_TRANSITION, { from, to });
  }
}

export function isAuthError(error: any): error is AuthError {
  return error instanceof AuthError;
}

export function formatAuthError(error: Error | AuthError): string {
  if (isAuthError(error)) {
    let formatted = `❌ ${error.message}`;
    
    if (error.details) {
      formatted += `\n   ${error.details}`;
    }
    
    if (error.suggestedAction) {
      formatted += `\n   💡 ${error.suggestedAction}`;
    }
    
    return formatted;
  }
  
  return `❌ ${error.message}`;
}

export function logAuthError(error: Error | AuthError, context?: string): void {
  const prefix = context ? `[${context}] ` : '';
  console.error(`${prefix}${formatAuthError(error)}`);
  
  if (isAuthError(error) && error.sessionName) {
    console.error(`   Session: ${error.sessionName}`);
  }
}