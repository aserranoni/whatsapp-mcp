# WhatsApp MCP Server - Authentication Architecture

This document provides detailed information about the advanced authentication system implemented in the WhatsApp MCP Server.

## Overview

The authentication system is built with a modular, extensible architecture that supports multiple authentication strategies, comprehensive state management, and robust error handling.

## Architecture Components

### 1. Authentication Configuration (`AuthConfigManager`)

Centralizes all authentication-related configuration with support for environment variable overrides.

```typescript
interface AuthConfig {
  sessionDir: string;           // Directory for session storage
  sessionPrefix: string;        // Prefix for session directories
  authTimeoutMs: number;        // Authentication timeout
  qrCodeTimeout: number;        // QR code timeout
  maxRetries: number;           // Maximum retry attempts
  retryDelayMs: number;         // Delay between retries
}
```

**Environment Variables:**
- `WHATSAPP_SESSION_DIR`: Custom session directory
- `WHATSAPP_SESSION_PREFIX`: Custom session prefix
- `WHATSAPP_AUTH_TIMEOUT_MS`: Authentication timeout
- `WHATSAPP_QR_TIMEOUT_MS`: QR code timeout
- `WHATSAPP_MAX_RETRIES`: Maximum retries
- `WHATSAPP_RETRY_DELAY_MS`: Retry delay

### 2. Session Management (`SessionManager`)

Handles session discovery, validation, and cleanup operations.

```typescript
interface SessionInfo {
  name: string;       // Session name
  path: string;       // Full path to session
  mtime: Date;        // Last modified time
  isValid: boolean;   // Session validity
}
```

**Key Features:**
- Automatic session discovery
- Session validation
- Most recent session selection
- Lock file cleanup
- Session path management

### 3. Authentication State Management (`AuthStateManager`)

Provides comprehensive state tracking with transition validation and history.

```typescript
enum AuthState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  WAITING_FOR_QR = 'waiting_for_qr',
  AUTHENTICATING = 'authenticating',
  AUTHENTICATED = 'authenticated',
  READY = 'ready',
  FAILED = 'failed',
  DISCONNECTED = 'disconnected',
  DESTROYED = 'destroyed'
}
```

**State Transitions:**
```
UNINITIALIZED → INITIALIZING → {WAITING_FOR_QR, AUTHENTICATING, READY}
WAITING_FOR_QR → AUTHENTICATING
AUTHENTICATING → {AUTHENTICATED, FAILED}
AUTHENTICATED → {READY, FAILED}
READY → {DISCONNECTED, FAILED, DESTROYED}
FAILED → {INITIALIZING, DESTROYED}
DISCONNECTED → {INITIALIZING, DESTROYED, FAILED}
```

**Features:**
- State transition validation
- Transition history tracking
- Event listeners for state changes
- Stuck state detection
- Last error tracking

### 4. Authentication Strategies (`AuthStrategyManager`)

Implements the Strategy pattern for different authentication methods.

#### Available Strategies

**SessionRestoreStrategy:**
- Attempts to use existing authenticated sessions
- Validates session availability
- Fastest authentication method

**QrCodeStrategy:**
- Requires QR code scanning
- Used when no valid session exists
- Fallback authentication method

#### Strategy Selection

The system automatically selects the best strategy:
1. Check if valid session exists → Use SessionRestoreStrategy
2. No valid session → Use QrCodeStrategy
3. Provide clear instructions for required actions

### 5. Error Handling (`AuthError` & `AuthErrorMessages`)

Comprehensive error handling with structured error types and recovery suggestions.

```typescript
enum AuthErrorCode {
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  QR_CODE_REQUIRED = 'QR_CODE_REQUIRED',
  INITIALIZATION_TIMEOUT = 'INITIALIZATION_TIMEOUT',
  // ... more error codes
}
```

**Error Features:**
- Structured error codes
- Detailed error messages
- Recovery suggestions
- Session context information
- Recoverable vs non-recoverable errors

## Usage Examples

### Basic Authentication Flow

```typescript
import { WhatsAppClientWrapper } from 'whatsapp-mcp-server';

const client = new WhatsAppClientWrapper({
  sessionName: 'my-session',
  qrCodeTimeout: 60000,
  authTimeoutMs: 30000,
  userDataDir: './whatsapp_session'
});

// Set up auth state monitoring
client.onAuthStateChange((info) => {
  console.log(`Auth state: ${info.state}`);
  if (info.message) {
    console.log(`Message: ${info.message}`);
  }
});

try {
  // Authentication happens automatically
  await client.initialize();
  console.log('Client ready!');
} catch (error) {
  if (isAuthError(error)) {
    console.log(`Auth error: ${error.code}`);
    console.log(`Recovery: ${error.suggestedAction}`);
  }
}
```

### Advanced Configuration

```typescript
import { AuthConfigManager, AuthErrorMessages } from 'whatsapp-mcp-server';

// Custom auth configuration
const authConfig = AuthConfigManager.createAuthConfig({
  sessionDir: '/custom/session/path',
  authTimeoutMs: 45000,
  maxRetries: 5
});

// Validate configuration
try {
  AuthConfigManager.validateConfig(authConfig);
} catch (error) {
  console.error('Invalid config:', error.message);
}
```

### Error Handling

```typescript
import { isAuthError, logAuthError, AuthErrorCode } from 'whatsapp-mcp-server';

try {
  await client.initialize();
} catch (error) {
  if (isAuthError(error)) {
    // Handle specific error types
    switch (error.code) {
      case AuthErrorCode.SESSION_NOT_FOUND:
        console.log('Run "npm run auth" to create session');
        break;
      case AuthErrorCode.QR_CODE_REQUIRED:
        console.log('QR code authentication needed');
        break;
      default:
        logAuthError(error, 'Client Init');
    }
  }
}
```

### Auth State Monitoring

```typescript
// Monitor specific states
client.onAuthStateChange((info) => {
  switch (info.state) {
    case AuthState.INITIALIZING:
      console.log('Starting authentication...');
      break;
    case AuthState.READY:
      console.log(`Ready! Phone: ${info.phoneNumber}`);
      break;
    case AuthState.FAILED:
      console.log(`Failed: ${info.error}`);
      break;
  }
});

// Check current state
const currentState = client.getAuthState();
const stateInfo = client.getAuthStateInfo();
const history = client.getAuthHistory();

console.log(`Current: ${currentState}`);
console.log(`History: ${history.length} transitions`);
```

### Strategy Information

```typescript
// Get available strategies
const strategies = client.getAuthStrategies();
console.log(`Available: ${strategies.join(', ')}`);

// Get recommended strategy
const recommended = await client.getRecommendedAuthStrategy();
console.log(`Recommended: ${recommended}`);

// Get auth configuration
const config = client.getAuthConfig();
console.log(`Session dir: ${config.sessionDir}`);
console.log(`Timeout: ${config.authTimeoutMs}ms`);
```

## Configuration Best Practices

### Environment Variables

```bash
# Production settings
WHATSAPP_SESSION_DIR=/var/whatsapp/sessions
WHATSAPP_AUTH_TIMEOUT_MS=60000
WHATSAPP_QR_TIMEOUT_MS=300000
WHATSAPP_MAX_RETRIES=3
WHATSAPP_RETRY_DELAY_MS=5000

# Development settings  
WHATSAPP_SESSION_DIR=./dev-sessions
WHATSAPP_AUTH_TIMEOUT_MS=30000
WHATSAPP_MAX_RETRIES=1
```

### Session Management

1. **Session Directory Structure:**
   ```
   whatsapp_session/
   ├── session-default/
   │   ├── Default/
   │   └── ...
   └── session-custom/
       ├── Default/
       └── ...
   ```

2. **Backup Sessions:**
   ```bash
   # Backup session before major changes
   cp -r whatsapp_session/session-name whatsapp_session/session-name.backup
   ```

3. **Session Cleanup:**
   ```bash
   # Remove old or corrupted sessions
   rm -rf whatsapp_session/session-old
   ```

## Troubleshooting

### Common Issues

**1. Session Not Found**
```
Error: SESSION_NOT_FOUND
Solution: Run "npm run auth" to create a new session
```

**2. Session Expired** 
```
Error: SESSION_EXPIRED  
Solution: Run "npm run auth" to re-authenticate
```

**3. Authentication Timeout**
```
Error: INITIALIZATION_TIMEOUT
Solution: Check network connection and increase timeout
```

**4. Invalid State Transition**
```
Error: INVALID_STATE_TRANSITION
Solution: This indicates a programming error - report as bug
```

### Debug Information

```typescript
// Enable debug logging
process.env.DEBUG_MESSAGES = 'true';

// Get detailed auth information
const status = client.getStatus();
const authInfo = client.getAuthStateInfo();  
const history = client.getAuthHistory();

console.log('Status:', JSON.stringify(status, null, 2));
console.log('Auth Info:', JSON.stringify(authInfo, null, 2));
console.log('History:', history.map(h => `${h.from}→${h.to}`).join(', '));
```

### Recovery Procedures

**1. Reset Authentication:**
```bash
# Remove all sessions
rm -rf whatsapp_session/
# Re-authenticate
npm run auth
```

**2. Force New Session:**
```bash
# Create new session with different name
npm run auth new-session-name
```

**3. Clear Lock Files:**
```bash
# Remove Chrome lock files
find whatsapp_session/ -name "SingletonLock" -delete
find whatsapp_session/ -name "SingletonSocket" -delete  
find whatsapp_session/ -name "SingletonCookie" -delete
```

## Migration Guide

If upgrading from a previous version, the new auth system is backward compatible:

1. **Existing sessions** will be automatically detected and used
2. **Configuration** will use environment variables if available, otherwise defaults
3. **Error handling** is now more descriptive but doesn't break existing error catching
4. **New features** like state monitoring and strategy selection are optional

The migration is seamless - no code changes required for basic usage.

## API Reference

### AuthConfigManager

- `createAuthConfig(overrides?): AuthConfig` - Create configuration
- `validateConfig(config): void` - Validate configuration  
- `createPuppeteerConfig(overrides?): PuppeteerConfig` - Puppeteer settings
- `createWebVersionConfig(overrides?): WebVersionConfig` - WhatsApp version

### SessionManager

- `findValidSessions(): Promise<SessionInfo[]>` - Find all sessions
- `getMostRecentValidSession(): Promise<SessionInfo>` - Get latest session
- `sessionExists(name): Promise<boolean>` - Check session existence
- `cleanupLockFiles(name): Promise<void>` - Clean session locks

### AuthStateManager

- `getCurrentState(): AuthState` - Current state
- `transitionTo(state, options?): void` - Change state
- `getStateInfo(): AuthStateInfo` - Detailed state info
- `getTransitionHistory(): AuthStateTransition[]` - State history
- `onStateChange(state, callback): void` - Listen for specific state
- `onAnyStateChange(callback): void` - Listen for any state change

### WhatsAppClientWrapper (Auth Methods)

- `getAuthState(): AuthState` - Current auth state
- `getAuthStateInfo(): AuthStateInfo` - Detailed auth info  
- `getAuthHistory(): AuthStateTransition[]` - Auth history
- `getAuthStrategies(): string[]` - Available strategies
- `getRecommendedAuthStrategy(): Promise<string>` - Best strategy
- `getAuthConfig(): AuthConfig` - Auth configuration
- `onAuthStateChange(callback): void` - Monitor state changes

This architecture provides a robust, extensible, and user-friendly authentication system that handles the complexity of WhatsApp Web authentication while providing clear feedback and recovery options.