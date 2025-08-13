import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { BaseMessageStore, MessageStoreStats } from './message-store.js';
import type { IncomingMessage, MessageFilter } from '../types.js';

export interface SQLiteConfig {
  dbPath: string;
  maxSize: number;
  retentionDays: number;
  enableEncryption: boolean;
  encryptionKey?: string;
  enableWAL?: boolean; // Write-Ahead Logging
  busyTimeout?: number;
}

export class SQLiteMessageStore extends BaseMessageStore {
  private db: sqlite3.Database | null = null;
  private dbPath: string;
  private isInitialized = false;

  constructor(config: SQLiteConfig) {
    super(config);
    this.dbPath = config.dbPath;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      await fs.mkdir(dir, { recursive: true });

      // Open database connection
      this.db = new sqlite3.Database(this.dbPath);

      // Promisify database methods
      const run = promisify(this.db.run.bind(this.db));
      const all = promisify(this.db.all.bind(this.db));
      const get = promisify(this.db.get.bind(this.db));

      // Enable WAL mode for better concurrent access
      if ((this.config as SQLiteConfig).enableWAL !== false) {
        await run("PRAGMA journal_mode=WAL");
      }

      // Set busy timeout
      const busyTimeout = (this.config as SQLiteConfig).busyTimeout || 30000;
      await run(`PRAGMA busy_timeout=${busyTimeout}`);

      // Create tables
      await this.createTables();

      // Create indexes for better query performance
      await this.createIndexes();

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize SQLite database:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    const run = promisify(this.db!.run.bind(this.db)) as (sql: string, params?: any[]) => Promise<void>;

    await run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL,
        to_id TEXT,
        body TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        is_group INTEGER NOT NULL,
        author TEXT,
        has_media INTEGER NOT NULL,
        media_url TEXT,
        quoted_message_id TEXT,
        quoted_message_body TEXT,
        quoted_message_from TEXT,
        quoted_message_timestamp INTEGER,
        mentions TEXT, -- JSON array
        is_forwarded INTEGER NOT NULL,
        is_starred INTEGER NOT NULL,
        is_read INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS message_metadata (
        message_id TEXT PRIMARY KEY,
        encrypted_data TEXT,
        checksum TEXT,
        FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
      )
    `);
  }

  private async createIndexes(): Promise<void> {
    const run = promisify(this.db!.run.bind(this.db)) as (sql: string, params?: any[]) => Promise<void>;

    await run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (timestamp DESC)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_messages_from_id ON messages (from_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_messages_to_id ON messages (to_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_messages_type ON messages (type)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages (is_read)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_messages_has_media ON messages (has_media)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (from_id, timestamp DESC)`);
  }

  async save(message: IncomingMessage): Promise<void> {
    await this.ensureInitialized();
    
    if (!this.shouldRetainMessage(message)) {
      return;
    }

    const run = promisify(this.db!.run.bind(this.db)) as (sql: string, params?: any[]) => Promise<void>;
    const now = Date.now();

    // Prepare mentions as JSON string
    const mentions = message.mentions ? JSON.stringify(message.mentions) : null;

    // Encrypt sensitive data if enabled
    const bodyData = this.config.enableEncryption ? 
      this.encryptData(message.body) : message.body;

    await run(`
      INSERT OR REPLACE INTO messages (
        id, from_id, to_id, body, type, timestamp, is_group, author,
        has_media, media_url, quoted_message_id, quoted_message_body,
        quoted_message_from, quoted_message_timestamp, mentions,
        is_forwarded, is_starred, is_read, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      message.id,
      message.from,
      message.to || null,
      bodyData,
      message.type,
      message.timestamp.getTime(),
      message.isGroup ? 1 : 0,
      message.author || null,
      message.hasMedia ? 1 : 0,
      message.mediaUrl || null,
      message.quotedMessage?.id || null,
      message.quotedMessage?.body || null,
      message.quotedMessage?.from || null,
      message.quotedMessage?.timestamp.getTime() || null,
      mentions,
      message.isForwarded ? 1 : 0,
      message.isStarred ? 1 : 0,
      message.isRead ? 1 : 0,
      now,
      now
    ]);

    // Clean up old messages if needed
    await this.cleanupOldMessages();
  }

  async get(messageId: string): Promise<IncomingMessage | null> {
    await this.ensureInitialized();
    
    const get = promisify(this.db!.get.bind(this.db)) as (sql: string, params?: any[]) => Promise<any>;
    const row = await get(`SELECT * FROM messages WHERE id = ?`, [messageId]);

    if (!row) {
      return null;
    }

    return this.rowToMessage(row);
  }

  async getRecent(limit: number): Promise<IncomingMessage[]> {
    await this.ensureInitialized();
    
    const all = promisify(this.db!.all.bind(this.db)) as (sql: string, params?: any[]) => Promise<any[]>;
    const rows = await all(`
      SELECT * FROM messages 
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [limit]);

    return rows.map(row => this.rowToMessage(row));
  }

  async getByChat(chatId: string, limit: number): Promise<IncomingMessage[]> {
    await this.ensureInitialized();
    
    const all = promisify(this.db!.all.bind(this.db)) as (sql: string, params?: any[]) => Promise<any[]>;
    const rows = await all(`
      SELECT * FROM messages 
      WHERE from_id = ? OR to_id = ?
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [chatId, chatId, limit]);

    return rows.map(row => this.rowToMessage(row));
  }

  async search(query: string): Promise<IncomingMessage[]> {
    await this.ensureInitialized();
    
    const all = promisify(this.db!.all.bind(this.db)) as (sql: string, params?: any[]) => Promise<any[]>;
    const searchTerm = `%${query.toLowerCase()}%`;
    
    const rows = await all(`
      SELECT * FROM messages 
      WHERE LOWER(body) LIKE ? 
         OR LOWER(from_id) LIKE ? 
         OR LOWER(author) LIKE ?
      ORDER BY timestamp DESC
    `, [searchTerm, searchTerm, searchTerm]);

    return rows.map(row => this.rowToMessage(row));
  }

  async filter(filter: MessageFilter): Promise<IncomingMessage[]> {
    await this.ensureInitialized();
    
    let query = `SELECT * FROM messages WHERE 1=1`;
    const params: any[] = [];

    if (filter.chatId) {
      query += ` AND (from_id = ? OR to_id = ?)`;
      params.push(filter.chatId, filter.chatId);
    }

    if (filter.type) {
      query += ` AND type = ?`;
      params.push(filter.type);
    }

    if (filter.from) {
      query += ` AND from_id = ?`;
      params.push(filter.from);
    }

    if (filter.startDate) {
      query += ` AND timestamp >= ?`;
      params.push(filter.startDate.getTime());
    }

    if (filter.endDate) {
      query += ` AND timestamp <= ?`;
      params.push(filter.endDate.getTime());
    }

    if (filter.isUnread !== undefined) {
      query += ` AND is_read = ?`;
      params.push(filter.isUnread ? 0 : 1);
    }

    if (filter.hasMedia !== undefined) {
      query += ` AND has_media = ?`;
      params.push(filter.hasMedia ? 1 : 0);
    }

    if (filter.searchText) {
      query += ` AND LOWER(body) LIKE ?`;
      params.push(`%${filter.searchText.toLowerCase()}%`);
    }

    query += ` ORDER BY timestamp DESC`;

    const all = promisify(this.db!.all.bind(this.db)) as (sql: string, params?: any[]) => Promise<any[]>;
    const rows = await all(query, params);

    return rows.map(row => this.rowToMessage(row));
  }

  async delete(messageId: string): Promise<void> {
    await this.ensureInitialized();
    
    const run = promisify(this.db!.run.bind(this.db)) as (sql: string, params?: any[]) => Promise<void>;
    await run(`DELETE FROM messages WHERE id = ?`, [messageId]);
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    
    const run = promisify(this.db!.run.bind(this.db)) as (sql: string, params?: any[]) => Promise<void>;
    await run(`DELETE FROM messages`);
    await run(`DELETE FROM message_metadata`);
    await run(`VACUUM`); // Reclaim space
  }

  async getStats(): Promise<MessageStoreStats> {
    await this.ensureInitialized();
    
    const get = promisify(this.db!.get.bind(this.db)) as (sql: string, params?: any[]) => Promise<any>;
    const all = promisify(this.db!.all.bind(this.db)) as (sql: string, params?: any[]) => Promise<any[]>;

    // Get basic counts
    const totalResult = await get(`SELECT COUNT(*) as count FROM messages`);
    const totalMessages = totalResult?.count || 0;

    if (totalMessages === 0) {
      return {
        totalMessages: 0,
        totalChats: 0,
        messagesByType: {}
      };
    }

    // Get unique chats count
    const chatResult = await get(`
      SELECT COUNT(DISTINCT chat_id) as count FROM (
        SELECT from_id as chat_id FROM messages 
        UNION 
        SELECT to_id as chat_id FROM messages WHERE to_id IS NOT NULL
      )
    `);

    // Get oldest and newest messages
    const timeResult = await get(`
      SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM messages
    `);

    // Get message counts by type
    const typeResults = await all(`
      SELECT type, COUNT(*) as count FROM messages GROUP BY type
    `);

    const messagesByType: Record<string, number> = {};
    if (typeResults) {
      typeResults.forEach((row: any) => {
        messagesByType[row.type] = row.count;
      });
    }

    // Get database file size
    let storageSize = 0;
    try {
      const stats = await fs.stat(this.dbPath);
      storageSize = stats.size;
    } catch (error) {
      // File might not exist yet
    }

    return {
      totalMessages,
      totalChats: chatResult?.count || 0,
      oldestMessage: timeResult?.oldest ? new Date(timeResult.oldest) : undefined,
      newestMessage: timeResult?.newest ? new Date(timeResult.newest) : undefined,
      messagesByType,
      storageSize
    };
  }

  private rowToMessage(row: any): IncomingMessage {
    // Decrypt body if encryption is enabled
    const body = this.config.enableEncryption ? 
      this.decryptData(row.body) : row.body;

    // Parse mentions
    let mentions: string[] | undefined;
    if (row.mentions) {
      try {
        mentions = JSON.parse(row.mentions);
      } catch (error) {
        console.warn('Failed to parse mentions:', error);
      }
    }

    // Build quoted message if exists
    let quotedMessage;
    if (row.quoted_message_id) {
      quotedMessage = {
        id: row.quoted_message_id,
        body: row.quoted_message_body || '',
        from: row.quoted_message_from || '',
        timestamp: new Date(row.quoted_message_timestamp)
      };
    }

    return {
      id: row.id,
      from: row.from_id,
      to: row.to_id || '',
      body,
      type: row.type,
      timestamp: new Date(row.timestamp),
      isGroup: row.is_group === 1,
      author: row.author || undefined,
      hasMedia: row.has_media === 1,
      mediaUrl: row.media_url || undefined,
      quotedMessage,
      mentions,
      isForwarded: row.is_forwarded === 1,
      isStarred: row.is_starred === 1,
      isRead: row.is_read === 1
    };
  }

  private async cleanupOldMessages(): Promise<void> {
    if (this.config.retentionDays <= 0) {
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const run = promisify(this.db!.run.bind(this.db)) as (sql: string, params?: any[]) => Promise<void>;
    await run(`DELETE FROM messages WHERE timestamp < ?`, [cutoffDate.getTime()]);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      const close = promisify(this.db.close.bind(this.db));
      await close();
      this.db = null;
      this.isInitialized = false;
    }
  }

  // Additional SQLite-specific methods
  async vacuum(): Promise<void> {
    await this.ensureInitialized();
    const run = promisify(this.db!.run.bind(this.db)) as (sql: string, params?: any[]) => Promise<void>;
    await run(`VACUUM`);
  }

  async analyze(): Promise<void> {
    await this.ensureInitialized();
    const run = promisify(this.db!.run.bind(this.db)) as (sql: string, params?: any[]) => Promise<void>;
    await run(`ANALYZE`);
  }

  async backup(backupPath: string): Promise<void> {
    await this.ensureInitialized();
    
    // Simple file copy backup
    await fs.copyFile(this.dbPath, backupPath);
  }
}