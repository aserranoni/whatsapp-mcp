#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { WhatsAppClientWrapper } from './whatsapp-client.js';
import { TTSIntegration } from './tts-integration.js';
import { SessionManager, AuthConfigManager } from './auth/index.js';
import type { 
  WhatsAppConfig
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Validation schemas
const SendTextMessageSchema = z.object({
  chatId: z.string().describe('WhatsApp chat ID (phone number with country code, e.g., 5511999999999@c.us)'),
  text: z.string().describe('Message text to send'),
});

const SendAudioMessageSchema = z.object({
  chatId: z.string().describe('WhatsApp chat ID'),
  filePath: z.string().describe('Absolute path to the audio file'),
  caption: z.string().optional().describe('Optional caption for the audio message'),
  sendAsVoiceNote: z.boolean().optional().default(true).describe('Send as voice note (PTT) or regular audio file'),
});

const SendTTSMessageSchema = z.object({
  chatId: z.string().describe('WhatsApp chat ID'),
  text: z.string().describe('Text to convert to speech'),
  voiceName: z.string().optional().describe('Voice name for TTS (if available)'),
  speed: z.number().optional().default(1.0).describe('Speech speed (0.5-2.0)'),
});

const SendMediaFromUrlSchema = z.object({
  chatId: z.string().describe('WhatsApp chat ID'),
  url: z.string().url().describe('URL of the media to send'),
  caption: z.string().optional().describe('Optional caption for the media'),
});

class WhatsAppMcpServer {
  private server: Server;
  private whatsappClient: WhatsAppClientWrapper | null = null;
  private ttsIntegration: TTSIntegration;
  private sessionManager: SessionManager;
  private authConfig: import('./auth/index.js').AuthConfig;

  constructor() {
    this.server = new Server(
      {
        name: 'whatsapp-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.ttsIntegration = new TTSIntegration(path.join(__dirname, '..', 'audio'));
    
    this.authConfig = AuthConfigManager.createAuthConfig();
    AuthConfigManager.validateConfig(this.authConfig);
    
    this.sessionManager = new SessionManager({
      sessionDir: this.authConfig.sessionDir,
      sessionPrefix: this.authConfig.sessionPrefix
    });
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      console.log('\\nShutting down WhatsApp MCP server...');
      if (this.whatsappClient) {
        await this.whatsappClient.destroy();
      }
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_whatsapp_status',
            description: 'Get current WhatsApp client connection status',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'send_text_message',
            description: 'Send a text message via WhatsApp',
            inputSchema: {
              type: 'object',
              properties: {
                chatId: {
                  type: 'string',
                  description: 'WhatsApp chat ID (phone number with country code, e.g., 5511999999999@c.us)',
                },
                text: {
                  type: 'string',
                  description: 'Message text to send',
                },
              },
              required: ['chatId', 'text'],
            },
          },
          {
            name: 'send_audio_message',
            description: 'Send an audio file or voice note via WhatsApp',
            inputSchema: {
              type: 'object',
              properties: {
                chatId: {
                  type: 'string',
                  description: 'WhatsApp chat ID',
                },
                filePath: {
                  type: 'string',
                  description: 'Absolute path to the audio file',
                },
                caption: {
                  type: 'string',
                  description: 'Optional caption for the audio message',
                },
                sendAsVoiceNote: {
                  type: 'boolean',
                  description: 'Send as voice note (PTT) or regular audio file',
                  default: true,
                },
              },
              required: ['chatId', 'filePath'],
            },
          },
          {
            name: 'send_tts_message',
            description: 'Generate TTS audio and send as voice note (requires ElevenLabs integration)',
            inputSchema: {
              type: 'object',
              properties: {
                chatId: {
                  type: 'string',
                  description: 'WhatsApp chat ID',
                },
                text: {
                  type: 'string',
                  description: 'Text to convert to speech',
                },
                voiceName: {
                  type: 'string',
                  description: 'Voice name for TTS (if available)',
                },
                speed: {
                  type: 'number',
                  description: 'Speech speed (0.5-2.0)',
                  default: 1.0,
                },
              },
              required: ['chatId', 'text'],
            },
          },
          {
            name: 'send_media_from_url',
            description: 'Send media (image, video, audio) from a URL',
            inputSchema: {
              type: 'object',
              properties: {
                chatId: {
                  type: 'string',
                  description: 'WhatsApp chat ID',
                },
                url: {
                  type: 'string',
                  format: 'uri',
                  description: 'URL of the media to send',
                },
                caption: {
                  type: 'string',
                  description: 'Optional caption for the media',
                },
              },
              required: ['chatId', 'url'],
            },
          },
          {
            name: 'list_contacts',
            description: 'Get list of WhatsApp contacts',
            inputSchema: {
              type: 'object',
              properties: {
                includeGroups: {
                  type: 'boolean',
                  description: 'Include group chats in the results',
                  default: false,
                },
              },
            },
          },
          {
            name: 'send_task_completion_notification',
            description: 'Send a notification when a task is completed (combines TTS generation and WhatsApp sending)',
            inputSchema: {
              type: 'object',
              properties: {
                chatId: {
                  type: 'string',
                  description: 'WhatsApp chat ID to send notification to',
                },
                taskName: {
                  type: 'string',
                  description: 'Name of the completed task',
                },
                summary: {
                  type: 'string',
                  description: 'Brief summary of what was accomplished',
                },
                includeAudio: {
                  type: 'boolean',
                  description: 'Whether to include audio notification',
                  default: true,
                },
              },
              required: ['chatId', 'taskName', 'summary'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_whatsapp_status':
            return await this.getWhatsAppStatus();

          case 'send_text_message':
            const textParams = SendTextMessageSchema.parse(args);
            return await this.sendTextMessage(textParams);

          case 'send_audio_message':
            const audioParams = SendAudioMessageSchema.parse(args);
            return await this.sendAudioMessage(audioParams);

          case 'send_tts_message':
            const ttsParams = SendTTSMessageSchema.parse(args);
            return await this.sendTTSMessage(ttsParams);

          case 'send_media_from_url':
            const mediaParams = SendMediaFromUrlSchema.parse(args);
            return await this.sendMediaFromUrl(mediaParams);

          case 'list_contacts':
            return await this.listContacts(args);

          case 'send_task_completion_notification':
            return await this.sendTaskCompletionNotification(args);

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
          );
        }
        throw error;
      }
    });
  }

  private async ensureWhatsAppClient(): Promise<void> {
    if (this.whatsappClient) {
      return;
    }

    try {
      const sessionInfo = await this.sessionManager.getMostRecentValidSession();
      
      // Clean up any lock files from previous sessions
      await this.sessionManager.cleanupLockFiles(sessionInfo.name);
      
      const config: WhatsAppConfig = {
        sessionName: sessionInfo.name,
        qrCodeTimeout: this.authConfig.qrCodeTimeout,
        authTimeoutMs: this.authConfig.authTimeoutMs,
        userDataDir: this.authConfig.sessionDir,
      };

      this.whatsappClient = new WhatsAppClientWrapper(config);
      console.log(`Loading WhatsApp session: ${sessionInfo.name}`);
      await this.whatsappClient.initialize();
      console.log('WhatsApp client loaded successfully!');
    } catch (error) {
      console.error('Failed to load WhatsApp client:', error);
      throw error;
    }
  }


  private async getWhatsAppStatus(): Promise<CallToolResult> {
    try {
      console.log('🔄 Getting WhatsApp status - attempting to ensure client...');
      await this.ensureWhatsAppClient();
      console.log('✅ WhatsApp client ensured, getting status...');
      const status = this.whatsappClient!.getStatus();
      console.log('📊 Status retrieved:', status);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(status, null, 2),
        }],
      };
    } catch (error) {
      console.error('❌ Error getting WhatsApp status:', error);
      return {
        content: [{
          type: 'text',
          text: `WhatsApp client not available: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async sendTextMessage(params: z.infer<typeof SendTextMessageSchema>): Promise<CallToolResult> {
    try {
      await this.ensureWhatsAppClient();
      await this.whatsappClient!.sendTextMessage(params);
      return {
        content: [{
          type: 'text',
          text: `Text message sent successfully to ${params.chatId}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to send text message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async sendAudioMessage(params: z.infer<typeof SendAudioMessageSchema>): Promise<CallToolResult> {
    try {
      await this.ensureWhatsAppClient();
      await this.whatsappClient!.sendAudioMessage(params);
      const messageType = params.sendAsVoiceNote ? 'voice note' : 'audio file';
      return {
        content: [{
          type: 'text',
          text: `Audio ${messageType} sent successfully to ${params.chatId}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to send audio message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async sendTTSMessage(params: z.infer<typeof SendTTSMessageSchema>): Promise<CallToolResult> {
    try {
      await this.ensureWhatsAppClient();
      // Try to generate TTS using ElevenLabs first, then fallback
      let audioPath: string;
      
      try {
        audioPath = await this.ttsIntegration.generateTTSWithElevenLabs({
          text: params.text,
          voiceName: params.voiceName,
          speed: params.speed,
        });
      } catch (elevenLabsError) {
        console.log('ElevenLabs TTS failed, trying system TTS:', elevenLabsError);
        audioPath = await this.ttsIntegration.generateSimpleTTS(params.text);
      }

      // Send the generated audio as a voice note
      await this.whatsappClient!.sendAudioMessage({
        chatId: params.chatId,
        filePath: audioPath,
        sendAsVoiceNote: true,
      });

      return {
        content: [{
          type: 'text',
          text: `TTS voice message sent successfully to ${params.chatId}. Audio file: ${path.basename(audioPath)}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to send TTS message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async sendMediaFromUrl(params: z.infer<typeof SendMediaFromUrlSchema>): Promise<CallToolResult> {
    try {
      await this.ensureWhatsAppClient();
      await this.whatsappClient!.sendMediaFromUrl(params.chatId, params.url, params.caption);
      return {
        content: [{
          type: 'text',
          text: `Media from URL sent successfully to ${params.chatId}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to send media from URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async listContacts(args: any): Promise<CallToolResult> {
    try {
      await this.ensureWhatsAppClient();
      const contacts = await this.whatsappClient!.getContacts();
      const includeGroups = args.includeGroups || false;
      
      const filteredContacts = includeGroups 
        ? contacts 
        : contacts.filter(contact => !contact.isGroup);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(filteredContacts, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to list contacts: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async sendTaskCompletionNotification(args: any): Promise<CallToolResult> {
    const { chatId, taskName, summary, includeAudio = true } = args;

    try {
      const textMessage = `✅ Task Completed: ${taskName}\\n\\n${summary}`;
      
      await this.ensureWhatsAppClient();

      // Send text notification
      await this.whatsappClient!.sendTextMessage({ chatId, text: textMessage });

      if (includeAudio) {
        try {
          // Generate TTS for task completion
          const ttsText = this.ttsIntegration.formatTextForTTS(taskName, summary);
          let audioPath: string;
          
          try {
            audioPath = await this.ttsIntegration.generateTTSWithElevenLabs({
              text: ttsText,
            });
          } catch {
            // Fallback to system TTS
            audioPath = await this.ttsIntegration.generateSimpleTTS(ttsText);
          }

          // Send audio notification
          await this.whatsappClient!.sendAudioMessage({
            chatId,
            filePath: audioPath,
            sendAsVoiceNote: true,
          });

          // Clean up old files periodically
          if (Math.random() < 0.1) { // 10% chance to clean up
            this.ttsIntegration.cleanupOldFiles().catch(console.warn);
          }

          return {
            content: [{
              type: 'text',
              text: `Task completion notification with audio sent successfully to ${chatId}`,
            }],
          };
        } catch (audioError) {
          console.warn('Failed to send audio notification:', audioError);
          return {
            content: [{
              type: 'text',
              text: `Task completion text notification sent to ${chatId}. Audio notification failed: ${audioError instanceof Error ? audioError.message : 'Unknown error'}`,
            }],
          };
        }
      }

      return {
        content: [{
          type: 'text',
          text: `Task completion notification sent successfully to ${chatId}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to send task completion notification: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('WhatsApp MCP server running on stdio');
  }
}

const server = new WhatsAppMcpServer();
server.run().catch(console.error);