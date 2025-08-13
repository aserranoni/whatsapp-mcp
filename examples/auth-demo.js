#!/usr/bin/env node

/**
 * WhatsApp MCP Server - Auth System Demo
 * 
 * This example demonstrates the new authentication architecture including:
 * - Auth state management
 * - Auth strategy selection
 * - Error handling
 * - Configuration management
 */

import { WhatsAppClientWrapper } from '../dist/whatsapp-client.js';
import { 
  AuthConfigManager,
  AuthState,
  isAuthError,
  formatAuthError,
  logAuthError
} from '../dist/auth/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function demonstrateAuthSystem() {
  console.log('🚀 WhatsApp MCP Auth System Demo\n');
  
  try {
    // 1. Create and validate auth configuration
    console.log('1️⃣ Creating Auth Configuration...');
    const authConfig = AuthConfigManager.createAuthConfig({
      authTimeoutMs: 45000, // Custom timeout
      sessionDir: process.env.WHATSAPP_SESSION_DIR || './whatsapp_session'
    });
    
    console.log('✅ Auth Config created:', {
      sessionDir: authConfig.sessionDir,
      authTimeout: authConfig.authTimeoutMs + 'ms',
      qrTimeout: authConfig.qrCodeTimeout + 'ms',
      maxRetries: authConfig.maxRetries
    });
    
    AuthConfigManager.validateConfig(authConfig);
    console.log('✅ Auth Config validation passed\n');
    
    // 2. Create WhatsApp client with enhanced auth
    console.log('2️⃣ Initializing WhatsApp Client...');
    const config = {
      sessionName: process.env.WHATSAPP_SESSION_NAME || 'auth-demo',
      qrCodeTimeout: authConfig.qrCodeTimeout,
      authTimeoutMs: authConfig.authTimeoutMs,
      userDataDir: authConfig.sessionDir,
    };
    
    const client = new WhatsAppClientWrapper(config);
    
    // 3. Show available auth strategies
    console.log('3️⃣ Auth Strategy Information:');
    const availableStrategies = client.getAuthStrategies();
    console.log(`Available strategies: ${availableStrategies.join(', ')}`);
    
    const recommendedStrategy = await client.getRecommendedAuthStrategy();
    console.log(`Recommended strategy: ${recommendedStrategy}`);
    
    const clientAuthConfig = client.getAuthConfig();
    console.log(`Client auth config: sessionDir=${clientAuthConfig.sessionDir}, timeout=${clientAuthConfig.authTimeoutMs}ms\n`);
    
    // 4. Set up auth state monitoring
    console.log('4️⃣ Setting up Auth State Monitoring...');
    client.onAuthStateChange((info) => {
      console.log(`🔄 Auth State Changed: ${info.state}`);
      if (info.message) {
        console.log(`   Message: ${info.message}`);
      }
      if (info.sessionName) {
        console.log(`   Session: ${info.sessionName}`);
      }
    });
    
    // 5. Attempt initialization
    console.log('5️⃣ Attempting Client Initialization...');
    const startTime = Date.now();
    
    try {
      await client.initialize();
      const initTime = Date.now() - startTime;
      console.log(`✅ Client initialized successfully in ${initTime}ms\n`);
      
      // 6. Display auth state information
      console.log('6️⃣ Auth State Information:');
      const authState = client.getAuthState();
      const authInfo = client.getAuthStateInfo();
      const authHistory = client.getAuthHistory();
      
      console.log(`Current State: ${authState}`);
      console.log(`State Info:`, {
        state: authInfo.state,
        message: authInfo.message,
        sessionName: authInfo.sessionName,
        phoneNumber: authInfo.phoneNumber,
        timestamp: authInfo.timestamp
      });
      
      console.log(`\nAuth History (${authHistory.length} transitions):`);
      authHistory.forEach((transition, index) => {
        console.log(`  ${index + 1}. ${transition.from} → ${transition.to} (${transition.timestamp.toISOString()})`);
        if (transition.reason) {
          console.log(`     Reason: ${transition.reason}`);
        }
      });
      
      // 7. Display client status
      console.log('\n7️⃣ Client Status:');
      const status = client.getStatus();
      console.log('Status:', JSON.stringify(status, null, 2));
      
      // 8. Send a demo message if connected
      if (status.isConnected && status.phoneNumber) {
        console.log('\n8️⃣ Sending Demo Message...');
        const chatId = `${status.phoneNumber}@c.us`;
        const message = `🤖 WhatsApp MCP Auth Demo Complete! 
        
Auth Strategy: ${recommendedStrategy}
Session: ${config.sessionName}
Timestamp: ${new Date().toISOString()}

All authentication systems are working perfectly! ✅`;
        
        await client.sendTextMessage({
          chatId: chatId,
          text: message
        });
        
        console.log('✅ Demo message sent successfully!');
      }
      
    } catch (initError) {
      const initTime = Date.now() - startTime;
      console.log(`❌ Client initialization failed after ${initTime}ms\n`);
      
      if (isAuthError(initError)) {
        console.log('🔍 Auth Error Details:');
        console.log(`Code: ${initError.code}`);
        console.log(`Recoverable: ${initError.recoverable}`);
        if (initError.suggestedAction) {
          console.log(`💡 Suggested Action: ${initError.suggestedAction}`);
        }
        logAuthError(initError, 'Auth Demo');
      } else {
        console.error('❌ Unexpected initialization error:', initError.message);
      }
      
      // Still show auth state info even if init failed
      const authInfo = client.getAuthStateInfo();
      const authHistory = client.getAuthHistory();
      
      console.log('\n🔍 Auth State After Failure:');
      console.log(`State: ${authInfo.state}`);
      if (authInfo.error) {
        console.log(`Error: ${authInfo.error}`);
      }
      
      console.log(`\nAuth History (${authHistory.length} transitions):`);
      authHistory.forEach((transition, index) => {
        console.log(`  ${index + 1}. ${transition.from} → ${transition.to}`);
        if (transition.reason) {
          console.log(`     Reason: ${transition.reason}`);
        }
      });
    }
    
    // 9. Cleanup
    console.log('\n9️⃣ Cleaning up...');
    await client.destroy();
    console.log('✅ Client destroyed successfully');
    
  } catch (error) {
    if (isAuthError(error)) {
      console.log('\n❌ Auth System Error:');
      console.log(formatAuthError(error));
    } else {
      console.error('\n❌ Unexpected Error:', error.message);
      console.error(error.stack);
    }
  }
  
  console.log('\n🎉 Auth System Demo Complete!');
}

// Handle process signals gracefully
process.on('SIGINT', () => {
  console.log('\n⚠️  Process interrupted, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Process terminated, shutting down gracefully...');
  process.exit(0);
});

// Run the demo
demonstrateAuthSystem().catch(error => {
  console.error('💥 Demo failed:', error);
  process.exit(1);
});