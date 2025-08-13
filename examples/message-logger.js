#!/usr/bin/env node

/**
 * WhatsApp Message Logger Example
 * 
 * This example demonstrates comprehensive message logging, analytics, and monitoring
 * using the WhatsApp MCP server. It shows how to track message patterns, generate
 * reports, and maintain detailed logs of WhatsApp activity.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WhatsAppMessageLogger {
  constructor() {
    this.mcpProcess = null;
    this.isLogging = false;
    this.logPath = path.join(__dirname, 'logs');
    this.currentLogFile = null;
    this.dailyStats = new Map();
    this.contactStats = new Map();
    this.messageTypes = new Map();
    this.keywords = new Map();
    this.loggedMessageIds = new Set();
  }

  async start() {
    console.log('📝 Starting WhatsApp Message Logger...\n');

    // Create logs directory
    await this.ensureLogDirectory();

    // Start the MCP server
    const serverPath = path.join(__dirname, '..', 'dist', 'index.js');
    this.mcpProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    // Handle server output
    this.mcpProcess.stdout.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        // Handle responses if needed
      } catch (error) {
        console.log('Server:', data.toString());
      }
    });

    // Initialize WhatsApp client
    await this.initializeWhatsApp();
    
    // Configure logging
    await this.configureLogging();
    
    // Start logging
    await this.startLogging();

    console.log('✅ Message logger is now active!');
    console.log('📱 Scan QR code to start logging messages.\n');
    console.log(`📁 Logs are saved to: ${this.logPath}`);
  }

  async ensureLogDirectory() {
    try {
      await fs.access(this.logPath);
    } catch {
      await fs.mkdir(this.logPath, { recursive: true });
      console.log(`📁 Created logs directory: ${this.logPath}`);
    }
  }

  async sendCommand(method, params = {}) {
    if (!this.mcpProcess) {
      throw new Error('MCP server not started');
    }

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: method,
        arguments: params
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 30000);

      const handleResponse = (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === request.id) {
            clearTimeout(timeout);
            this.mcpProcess.stdout.removeListener('data', handleResponse);
            
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          }
        } catch (error) {
          // Ignore parsing errors
        }
      };

      this.mcpProcess.stdout.on('data', handleResponse);
      this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async initializeWhatsApp() {
    try {
      console.log('🔄 Initializing WhatsApp client...');
      await this.sendCommand('initialize_whatsapp', {
        sessionName: 'message-logger-session',
        authTimeoutMs: 120000
      });
      
      console.log('✅ WhatsApp client initialized');
    } catch (error) {
      console.error('❌ Failed to initialize WhatsApp:', error.message);
      throw error;
    }
  }

  async configureLogging() {
    console.log('🔄 Configuring message logging...');
    
    // Set current log file with timestamp
    const now = new Date();
    const timestamp = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    this.currentLogFile = path.join(this.logPath, `messages_${timestamp}.jsonl`);
    
    // Write header to log file
    await this.writeLogHeader();
    
    console.log('✅ Logging configured');
  }

  async writeLogHeader() {
    const header = {
      type: 'log_session_start',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      logger: 'WhatsApp MCP Message Logger',
      session_id: `session_${Date.now()}`
    };
    
    await this.writeToLog(header);
  }

  async writeToLog(data) {
    const logLine = JSON.stringify(data) + '\n';
    await fs.appendFile(this.currentLogFile, logLine, 'utf8');
  }

  async startLogging() {
    console.log('📝 Starting message logging...\n');
    this.isLogging = true;
    
    // Monitor for new messages every 2 seconds
    setInterval(async () => {
      if (this.isLogging) {
        try {
          await this.logNewMessages();
        } catch (error) {
          console.error('Error logging messages:', error.message);
        }
      }
    }, 2000);

    // Generate hourly reports
    setInterval(async () => {
      if (this.isLogging) {
        await this.generateHourlyReport();
      }
    }, 3600000); // 1 hour

    // Generate daily summary at midnight
    setInterval(async () => {
      if (this.isLogging) {
        await this.generateDailySummary();
      }
    }, 86400000); // 24 hours
  }

  async logNewMessages() {
    try {
      const result = await this.sendCommand('get_recent_messages', {
        limit: 20,
        includeMedia: true,
        includeMetadata: true
      });

      const data = JSON.parse(result.content[0].text);
      
      if (data.count > 0) {
        let newMessagesCount = 0;
        
        for (const message of data.messages) {
          if (!this.loggedMessageIds.has(message.id)) {
            await this.logMessage(message);
            this.loggedMessageIds.add(message.id);
            newMessagesCount++;
          }
        }
        
        if (newMessagesCount > 0) {
          console.log(`📝 Logged ${newMessagesCount} new messages`);
        }
      }
    } catch (error) {
      // Silently handle polling errors
      if (error.message !== 'Request timeout') {
        console.error('Error checking messages:', error.message);
      }
    }
  }

  async logMessage(message) {
    const logEntry = {
      type: 'message',
      timestamp: new Date().toISOString(),
      message_data: {
        id: message.id,
        from: this.anonymizeContact(message.from),
        to: this.anonymizeContact(message.to),
        body: message.body,
        type: message.type,
        message_timestamp: message.timestamp,
        is_group: message.isGroup,
        has_media: message.hasMedia,
        is_forwarded: message.isForwarded,
        is_starred: message.isStarred,
        is_read: message.isRead,
        mentions_count: message.mentions?.length || 0
      },
      metadata: {
        processing_timestamp: new Date().toISOString(),
        session_id: `session_${Date.now()}`
      }
    };

    // Add group-specific data
    if (message.isGroup) {
      logEntry.message_data.author = this.anonymizeContact(message.author);
      logEntry.message_data.group_id = this.anonymizeContact(message.from);
    }

    // Log media information without storing content
    if (message.hasMedia) {
      logEntry.message_data.media_info = {
        type: message.type,
        has_url: !!message.mediaUrl,
        url_length: message.mediaUrl?.length || 0
      };
    }

    // Write to log file
    await this.writeToLog(logEntry);
    
    // Update statistics
    this.updateStatistics(message);
    
    // Extract and log keywords
    if (message.body) {
      this.extractKeywords(message.body);
    }

    // Display real-time log info
    this.displayLogInfo(message);
  }

  anonymizeContact(contactId) {
    if (!contactId) return 'unknown';
    
    // Create a simple hash-based anonymization
    const hash = this.simpleHash(contactId);
    if (contactId.includes('@g.us')) {
      return `group_${hash}`;
    } else {
      return `contact_${hash}`;
    }
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  updateStatistics(message) {
    const today = new Date().toISOString().split('T')[0];
    const sender = this.anonymizeContact(message.from);

    // Daily stats
    if (!this.dailyStats.has(today)) {
      this.dailyStats.set(today, {
        total: 0,
        by_type: {},
        by_contact: {},
        groups: 0,
        media: 0
      });
    }
    
    const todayStats = this.dailyStats.get(today);
    todayStats.total++;
    
    // By type
    todayStats.by_type[message.type] = (todayStats.by_type[message.type] || 0) + 1;
    
    // By contact
    todayStats.by_contact[sender] = (todayStats.by_contact[sender] || 0) + 1;
    
    // Group messages
    if (message.isGroup) {
      todayStats.groups++;
    }
    
    // Media messages
    if (message.hasMedia) {
      todayStats.media++;
    }

    // Overall contact stats
    if (!this.contactStats.has(sender)) {
      this.contactStats.set(sender, {
        total: 0,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        types: {}
      });
    }
    
    const contactStat = this.contactStats.get(sender);
    contactStat.total++;
    contactStat.last_seen = new Date().toISOString();
    contactStat.types[message.type] = (contactStat.types[message.type] || 0) + 1;

    // Message types
    this.messageTypes.set(message.type, (this.messageTypes.get(message.type) || 0) + 1);
  }

  extractKeywords(text) {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3); // Only words longer than 3 chars

    words.forEach(word => {
      this.keywords.set(word, (this.keywords.get(word) || 0) + 1);
    });
  }

  displayLogInfo(message) {
    const timestamp = new Date().toLocaleTimeString();
    const sender = this.anonymizeContact(message.from);
    const messagePreview = message.body?.substring(0, 50) || '[Media message]';
    
    console.log(`[${timestamp}] ${sender} (${message.type}): ${messagePreview}${message.body?.length > 50 ? '...' : ''}`);
  }

  async generateHourlyReport() {
    const now = new Date();
    const hour = now.getHours();
    const report = {
      type: 'hourly_report',
      timestamp: now.toISOString(),
      hour: hour,
      stats: this.getHourlyStats()
    };

    await this.writeToLog(report);
    console.log(`\n📊 Hourly Report (${hour}:00) - Messages: ${report.stats.total_messages}`);
  }

  getHourlyStats() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);
    
    // This is a simplified version - in a real implementation,
    // you'd track messages by hour more precisely
    return {
      total_messages: this.loggedMessageIds.size,
      unique_contacts: this.contactStats.size,
      top_message_types: this.getTopMessageTypes(5),
      top_keywords: this.getTopKeywords(10)
    };
  }

  getTopMessageTypes(limit) {
    return Array.from(this.messageTypes.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([type, count]) => ({ type, count }));
  }

  getTopKeywords(limit) {
    return Array.from(this.keywords.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([keyword, count]) => ({ keyword, count }));
  }

  async generateDailySummary() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    if (this.dailyStats.has(dateStr)) {
      const stats = this.dailyStats.get(dateStr);
      const summary = {
        type: 'daily_summary',
        date: dateStr,
        timestamp: new Date().toISOString(),
        stats: stats,
        top_contacts: this.getTopContactsForDate(dateStr, 10),
        insights: this.generateInsights(stats)
      };

      await this.writeToLog(summary);
      await this.saveDailySummaryFile(dateStr, summary);
      
      console.log(`\n📈 Daily Summary for ${dateStr} generated`);
      console.log(`   Total messages: ${stats.total}`);
      console.log(`   Group messages: ${stats.groups}`);
      console.log(`   Media messages: ${stats.media}`);
    }
  }

  getTopContactsForDate(date, limit) {
    const stats = this.dailyStats.get(date);
    if (!stats) return [];

    return Object.entries(stats.by_contact)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([contact, count]) => ({ contact, count }));
  }

  generateInsights(stats) {
    const insights = [];

    if (stats.media > stats.total * 0.3) {
      insights.push('High media message activity (>30% of total messages)');
    }

    if (stats.groups > stats.total * 0.5) {
      insights.push('Most activity from group chats');
    }

    const topType = Object.entries(stats.by_type)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (topType) {
      insights.push(`Most common message type: ${topType[0]} (${topType[1]} messages)`);
    }

    return insights;
  }

  async saveDailySummaryFile(date, summary) {
    const summaryPath = path.join(this.logPath, `summary_${date}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  }

  async exportLogs(format = 'json') {
    console.log(`\n📤 Exporting logs in ${format} format...`);
    
    const exportData = {
      export_timestamp: new Date().toISOString(),
      total_logged_messages: this.loggedMessageIds.size,
      statistics: {
        daily_stats: Object.fromEntries(this.dailyStats),
        contact_stats: Object.fromEntries(this.contactStats),
        message_types: Object.fromEntries(this.messageTypes),
        top_keywords: this.getTopKeywords(50)
      }
    };

    const exportPath = path.join(this.logPath, `export_${Date.now()}.${format}`);
    
    if (format === 'json') {
      await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2), 'utf8');
    } else if (format === 'csv') {
      // Simple CSV export for basic stats
      let csv = 'Type,Value,Count\n';
      for (const [type, count] of this.messageTypes) {
        csv += `message_type,${type},${count}\n`;
      }
      await fs.writeFile(exportPath, csv, 'utf8');
    }

    console.log(`✅ Export saved to: ${exportPath}`);
    return exportPath;
  }

  displayCurrentStats() {
    console.log('\n📊 Current Statistics:');
    console.log(`  Total messages logged: ${this.loggedMessageIds.size}`);
    console.log(`  Unique contacts: ${this.contactStats.size}`);
    console.log(`  Message types: ${this.messageTypes.size}`);
    console.log(`  Keywords tracked: ${this.keywords.size}`);
    
    console.log('\n🔥 Top Message Types:');
    const topTypes = this.getTopMessageTypes(5);
    topTypes.forEach(({ type, count }) => {
      console.log(`    ${type}: ${count}`);
    });

    console.log('\n💬 Top Keywords:');
    const topKeywords = this.getTopKeywords(10);
    topKeywords.forEach(({ keyword, count }) => {
      console.log(`    ${keyword}: ${count}`);
    });
  }

  async stop() {
    console.log('\n🛑 Stopping message logger...');
    this.isLogging = false;
    
    // Write session end log
    const sessionEnd = {
      type: 'log_session_end',
      timestamp: new Date().toISOString(),
      total_messages_logged: this.loggedMessageIds.size,
      session_duration: 'unknown' // Could track actual duration
    };
    
    await this.writeToLog(sessionEnd);
    
    // Display final stats
    this.displayCurrentStats();
    
    // Export final data
    await this.exportLogs('json');
    
    if (this.mcpProcess) {
      this.mcpProcess.kill();
    }
    
    console.log('✅ Message logger stopped');
    console.log(`📁 All logs saved to: ${this.logPath}`);
  }
}

// Example usage
async function runMessageLogger() {
  const logger = new WhatsAppMessageLogger();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Received shutdown signal...');
    await logger.stop();
    process.exit(0);
  });

  try {
    await logger.start();
    
    // Show stats every 10 minutes
    setInterval(() => {
      logger.displayCurrentStats();
    }, 600000);
    
    console.log('\n💡 Logger Commands:');
    console.log('  - Press Ctrl+C to stop and export logs');
    console.log('  - Stats will be displayed every 10 minutes');
    console.log('  - Hourly reports are generated automatically');
    console.log('  - Daily summaries are created at midnight\n');
    
  } catch (error) {
    console.error('❌ Failed to start message logger:', error.message);
    process.exit(1);
  }
}

// Run the logger if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMessageLogger().catch(console.error);
}

export { WhatsAppMessageLogger };