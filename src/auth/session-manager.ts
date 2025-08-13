import path from 'path';
import fs from 'fs/promises';

export interface SessionInfo {
  name: string;
  path: string;
  mtime: Date;
  isValid: boolean;
}

export interface SessionManagerConfig {
  sessionDir: string;
  sessionPrefix: string;
}

export class SessionManager {
  private config: SessionManagerConfig;

  constructor(config: SessionManagerConfig) {
    this.config = config;
  }

  async findValidSessions(): Promise<SessionInfo[]> {
    try {
      console.log(`🔍 Looking for sessions in: ${this.config.sessionDir}`);
      const entries = await fs.readdir(this.config.sessionDir);
      console.log(`📂 Found entries: ${entries.join(', ')}`);
      
      const sessionPaths = entries
        .filter(entry => entry.startsWith(this.config.sessionPrefix))
        .map(entry => ({
          name: entry.replace(`${this.config.sessionPrefix}`, ''),
          path: path.join(this.config.sessionDir, entry),
          fullEntry: entry
        }));

      console.log(`📱 Found ${sessionPaths.length} potential sessions: ${sessionPaths.map(s => s.name).join(', ')}`);

      const sessionsWithStats = await Promise.all(
        sessionPaths.map(async (session) => {
          try {
            const stats = await fs.stat(session.path);
            console.log(`📅 Session ${session.name} modified: ${stats.mtime}`);
            return {
              name: session.name,
              path: session.path,
              mtime: stats.mtime,
              isValid: await this.validateSession(session.path)
            };
          } catch (error) {
            console.log(`❌ Failed to get stats for ${session.name}:`, error);
            return null;
          }
        })
      );

      return sessionsWithStats
        .filter((s): s is SessionInfo => s !== null)
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        throw new Error(`Session directory not found: ${this.config.sessionDir}. Please run authentication first.`);
      }
      console.error('❌ Error in findValidSessions:', error);
      throw error;
    }
  }

  async getMostRecentValidSession(): Promise<SessionInfo> {
    const sessions = await this.findValidSessions();
    const validSessions = sessions.filter(s => s.isValid);
    
    if (validSessions.length === 0) {
      throw new Error('No valid WhatsApp sessions found. Please run authentication first.');
    }

    const selectedSession = validSessions[0]!;
    console.log(`✅ Selected session: ${selectedSession.name} (most recent: ${selectedSession.mtime})`);
    
    return selectedSession;
  }

  async cleanupLockFiles(sessionName: string): Promise<void> {
    try {
      const sessionPath = path.join(this.config.sessionDir, `${this.config.sessionPrefix}${sessionName}`);
      
      const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
      for (const lockFile of lockFiles) {
        const lockPath = path.join(sessionPath, lockFile);
        try {
          await fs.unlink(lockPath);
          console.log(`🗑️  Removed lock file: ${lockFile}`);
        } catch (error) {
          // File doesn't exist, which is fine
        }
      }
    } catch (error) {
      console.log('⚠️  Could not cleanup lock files:', (error as Error).message);
    }
  }

  async sessionExists(sessionName: string): Promise<boolean> {
    try {
      const sessionPath = path.join(this.config.sessionDir, `${this.config.sessionPrefix}${sessionName}`);
      await fs.access(sessionPath);
      return true;
    } catch {
      return false;
    }
  }

  private async validateSession(sessionPath: string): Promise<boolean> {
    try {
      // Check if session directory has required files/structure
      const stats = await fs.stat(sessionPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  getSessionPath(sessionName: string): string {
    return path.join(this.config.sessionDir, `${this.config.sessionPrefix}${sessionName}`);
  }
}