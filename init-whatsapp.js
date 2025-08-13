#!/usr/bin/env node

/**
 * WhatsApp MCP Server - Authentication Initialization Script
 * 
 * This script handles the initial WhatsApp authentication with QR code scanning.
 * Run this script once to authenticate and save your session, then the MCP server
 * can use the saved session without requiring QR code scanning.
 * 
 * Usage: node init-whatsapp.js [session-name]
 */

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WhatsAppInitializer {
  constructor(sessionName = 'whatsapp-mcp') {
    this.sessionName = sessionName;
    this.userDataDir = './whatsapp_session';
    this.client = null;
    this.isReady = false;
  }

  async cleanupLockFiles() {
    try {
      const sessionPath = path.join(this.userDataDir, `session-${this.sessionName}`);
      
      // Remove lock files that might prevent initialization
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
      console.log('⚠️  Could not cleanup lock files:', error.message);
    }
  }

  async initialize() {
    console.log('🚀 WhatsApp MCP Server - Session Initialization');
    console.log('='.repeat(50));
    console.log(`📁 Session name: ${this.sessionName}`);
    console.log(`💾 Data directory: ${this.userDataDir}`);
    console.log('');

    // Clean up any existing lock files
    await this.cleanupLockFiles();

    // Check if session already exists
    const sessionPath = path.join(this.userDataDir, `session-${this.sessionName}`);
    const hasExistingSession = await fs.access(sessionPath).then(() => true).catch(() => false);
    
    if (hasExistingSession) {
      console.log('📦 Found existing session, attempting to restore...');
    } else {
      console.log('🆕 No existing session found, QR code authentication required');
    }

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.sessionName,
        dataPath: this.userDataDir
      }),
      puppeteer: {
        headless: true,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
      }
    });

    this.setupEventHandlers();

    try {
      console.log('🔄 Initializing WhatsApp client...');
      await this.client.initialize();
      
      // Wait for authentication to complete
      await this.waitForReady();
      
      console.log('');
      console.log('✅ Authentication successful!');
      console.log('💾 Session has been saved for future use');
      console.log('🎉 You can now run the MCP server without QR code scanning');
      console.log('');
      console.log('Next steps:');
      console.log('  1. The MCP server will automatically use this saved session');
      console.log('  2. Your session will persist across restarts');
      console.log('  3. Re-run this script only if you need to re-authenticate');
      
    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      process.exit(1);
    } finally {
      if (this.client) {
        await this.client.destroy();
      }
      process.exit(0);
    }
  }

  setupEventHandlers() {
    this.client.on('qr', (qr) => {
      console.log('');
      console.log('📱 QR Code Generated - Please scan with your WhatsApp mobile app:');
      console.log('');
      qrcode.generate(qr, { small: true });
      console.log('');
      console.log('Instructions:');
      console.log('1. Open WhatsApp on your phone');
      console.log('2. Go to Settings > Connected Devices > Add Device');
      console.log('3. Point your phone camera at the QR code above');
      console.log('4. Wait for authentication to complete...');
      console.log('');
    });

    this.client.on('loading_screen', (percent, message) => {
      console.log(`🔄 Loading WhatsApp: ${percent}% - ${message}`);
    });

    this.client.on('authenticated', () => {
      console.log('🔐 Authentication successful! Session data saved.');
    });

    this.client.on('auth_failure', (msg) => {
      console.error('❌ Authentication failed:', msg);
      console.log('');
      console.log('Troubleshooting:');
      console.log('1. Make sure you scanned the QR code correctly');
      console.log('2. Check your internet connection');
      console.log('3. Try running the script again');
      process.exit(1);
    });

    this.client.on('ready', () => {
      console.log('🎯 WhatsApp client is ready!');
      
      if (this.client.info && this.client.info.wid) {
        const phoneNumber = this.client.info.wid.user;
        console.log(`📱 Connected as: +${phoneNumber}`);
      }
      
      this.isReady = true;
    });

    this.client.on('disconnected', (reason) => {
      console.log(`🔌 Disconnected: ${reason}`);
      if (reason === 'LOGOUT') {
        console.log('⚠️  You have been logged out. Please run this script again to re-authenticate.');
      }
    });
  }

  waitForReady() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timed out after 5 minutes'));
      }, 300000); // 5 minutes timeout

      const checkReady = () => {
        if (this.isReady) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkReady, 1000);
        }
      };

      checkReady();
    });
  }
}

// Main execution
async function main() {
  const sessionName = process.argv[2] || 'whatsapp-mcp';
  
  console.log('');
  
  const initializer = new WhatsAppInitializer(sessionName);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n🛑 Shutting down...');
    if (initializer.client) {
      await initializer.client.destroy();
    }
    process.exit(0);
  });

  await initializer.initialize();
}

main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});