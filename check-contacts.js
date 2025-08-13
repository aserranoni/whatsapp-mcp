#!/usr/bin/env node

import { WhatsAppClientWrapper } from './dist/whatsapp-client.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkContacts() {
  try {
    console.log('🚀 Initializing WhatsApp client to check contacts...');
    
    const config = {
      sessionName: 'whatsapp-mcp',
      qrCodeTimeout: 60000,
      authTimeoutMs: 30000,
      userDataDir: './whatsapp_session',
    };
    
    const client = new WhatsAppClientWrapper(config);
    console.log('📱 Initializing WhatsApp client...');
    
    await client.initialize();
    console.log('✅ WhatsApp client initialized successfully!');
    
    const contacts = await client.getContacts();
    console.log(`📞 Found ${contacts.length} contacts`);
    
    // Show first 5 contacts for debugging
    console.log('First 5 contacts:');
    contacts.slice(0, 5).forEach((contact, i) => {
      console.log(`${i + 1}. ID: ${contact.id}, Name: ${contact.name}, Number: ${contact.number}, IsGroup: ${contact.isGroup}`);
    });
    
    // Look for "My contacts" or similar
    const myContacts = contacts.filter(c => c.name && (c.name.toLowerCase().includes('me') || c.name.toLowerCase().includes('você') || c.id.includes('5511974949159')));
    console.log('\nPossible "self" contacts:');
    myContacts.forEach(contact => {
      console.log(`- ID: ${contact.id}, Name: ${contact.name}, Number: ${contact.number}`);
    });
    
    await client.destroy();
    console.log('🔚 Client destroyed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkContacts();