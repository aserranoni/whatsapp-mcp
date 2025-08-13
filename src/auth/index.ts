export { SessionManager, type SessionInfo, type SessionManagerConfig } from './session-manager.js';
export { 
  AuthConfigManager, 
  type AuthConfig, 
  type PuppeteerConfig, 
  type WebVersionConfig 
} from './auth-config.js';
export { 
  AuthStateManager,
  AuthState,
  type AuthStateInfo,
  type AuthStateTransition
} from './auth-state.js';
export {
  AuthStrategyManager,
  AuthStrategy,
  SessionRestoreStrategy,
  QrCodeStrategy,
  type AuthenticationResult,
  type AuthContext
} from './auth-strategy.js';