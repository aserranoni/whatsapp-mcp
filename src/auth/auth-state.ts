export enum AuthState {
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

export interface AuthStateInfo {
  state: AuthState;
  message?: string;
  error?: string;
  timestamp: Date;
  sessionName?: string;
  phoneNumber?: string;
}

export interface AuthStateTransition {
  from: AuthState;
  to: AuthState;
  timestamp: Date;
  reason?: string;
}

import { AuthErrorMessages } from './auth-errors.js';

export class AuthStateManager {
  private currentState: AuthState = AuthState.UNINITIALIZED;
  private stateInfo: AuthStateInfo;
  private transitions: AuthStateTransition[] = [];
  private listeners: Map<AuthState, Array<(info: AuthStateInfo) => void>> = new Map();

  constructor() {
    this.stateInfo = {
      state: AuthState.UNINITIALIZED,
      timestamp: new Date()
    };
  }

  getCurrentState(): AuthState {
    return this.currentState;
  }

  getStateInfo(): AuthStateInfo {
    return { ...this.stateInfo };
  }

  getTransitionHistory(): AuthStateTransition[] {
    return [...this.transitions];
  }

  transitionTo(newState: AuthState, options: {
    message?: string;
    error?: string;
    sessionName?: string;
    phoneNumber?: string;
    reason?: string;
  } = {}): void {
    const previousState = this.currentState;
    
    if (!this.isValidTransition(previousState, newState)) {
      throw AuthErrorMessages.createInvalidStateTransition(previousState, newState);
    }

    // Record transition
    this.transitions.push({
      from: previousState,
      to: newState,
      timestamp: new Date(),
      reason: options.reason
    });

    // Update current state
    this.currentState = newState;
    this.stateInfo = {
      state: newState,
      message: options.message,
      error: options.error,
      timestamp: new Date(),
      sessionName: options.sessionName || this.stateInfo.sessionName,
      phoneNumber: options.phoneNumber || this.stateInfo.phoneNumber
    };

    // Notify listeners
    this.notifyListeners(newState, this.stateInfo);
  }

  onStateChange(state: AuthState, callback: (info: AuthStateInfo) => void): void {
    if (!this.listeners.has(state)) {
      this.listeners.set(state, []);
    }
    this.listeners.get(state)!.push(callback);
  }

  onAnyStateChange(callback: (info: AuthStateInfo) => void): void {
    // Add listener for all states
    Object.values(AuthState).forEach(state => {
      this.onStateChange(state, callback);
    });
  }

  removeListener(state: AuthState, callback: (info: AuthStateInfo) => void): void {
    const listeners = this.listeners.get(state);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  isInState(...states: AuthState[]): boolean {
    return states.includes(this.currentState);
  }

  canTransitionTo(targetState: AuthState): boolean {
    return this.isValidTransition(this.currentState, targetState);
  }

  private isValidTransition(from: AuthState, to: AuthState): boolean {
    const validTransitions: Record<AuthState, AuthState[]> = {
      [AuthState.UNINITIALIZED]: [AuthState.INITIALIZING, AuthState.FAILED],
      [AuthState.INITIALIZING]: [AuthState.WAITING_FOR_QR, AuthState.AUTHENTICATING, AuthState.FAILED, AuthState.READY],
      [AuthState.WAITING_FOR_QR]: [AuthState.AUTHENTICATING, AuthState.FAILED],
      [AuthState.AUTHENTICATING]: [AuthState.AUTHENTICATED, AuthState.FAILED],
      [AuthState.AUTHENTICATED]: [AuthState.READY, AuthState.FAILED],
      [AuthState.READY]: [AuthState.DISCONNECTED, AuthState.FAILED, AuthState.DESTROYED],
      [AuthState.FAILED]: [AuthState.INITIALIZING, AuthState.DESTROYED],
      [AuthState.DISCONNECTED]: [AuthState.INITIALIZING, AuthState.DESTROYED, AuthState.FAILED],
      [AuthState.DESTROYED]: [] // Terminal state
    };

    return validTransitions[from]?.includes(to) || false;
  }

  private notifyListeners(state: AuthState, info: AuthStateInfo): void {
    const listeners = this.listeners.get(state);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(info);
        } catch (error) {
          console.error('Error in auth state listener:', error);
        }
      });
    }
  }

  reset(): void {
    this.transitions = [];
    this.currentState = AuthState.UNINITIALIZED;
    this.stateInfo = {
      state: AuthState.UNINITIALIZED,
      timestamp: new Date()
    };
  }

  getLastError(): string | undefined {
    const failedTransitions = this.transitions
      .filter(t => t.to === AuthState.FAILED)
      .reverse();
    
    if (failedTransitions.length > 0) {
      const lastFailedState = failedTransitions[0]!;
      return lastFailedState.reason || 'Unknown error';
    }

    return this.stateInfo.error;
  }

  getTimeSinceLastTransition(): number {
    if (this.transitions.length === 0) {
      return Date.now() - this.stateInfo.timestamp.getTime();
    }
    
    const lastTransition = this.transitions[this.transitions.length - 1]!;
    return Date.now() - lastTransition.timestamp.getTime();
  }

  isStuck(thresholdMs: number = 30000): boolean {
    const stuckStates = [AuthState.INITIALIZING, AuthState.WAITING_FOR_QR, AuthState.AUTHENTICATING];
    return stuckStates.includes(this.currentState) && this.getTimeSinceLastTransition() > thresholdMs;
  }
}