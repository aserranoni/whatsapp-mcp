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
  WhatsAppConfig, 
  AudioMessage, 
  TextMessage, 
  McpToolResult,
  TTSRequest,
  MessageReceivingConfig,
  MessageFilter,
  IncomingMessage
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

// Message retrieval schemas
const GetRecentMessagesSchema = z.object({
  limit: z.number().default(20).describe('Number of recent messages to retrieve'),
  chatId: z.string().optional().describe('Filter by specific chat ID'),
  onlyUnread: z.boolean().default(false).describe('Only retrieve unread messages'),
  includeMedia: z.boolean().default(true).describe('Include media messages'),
});

const GetMessageByIdSchema = z.object({
  messageId: z.string().describe('Unique message ID to retrieve'),
});

const GetConversationHistorySchema = z.object({
  chatId: z.string().describe('Chat ID to get history for'),
  limit: z.number().default(50).describe('Maximum number of messages to retrieve'),
  before: z.string().optional().describe('ISO date to get messages before'),
  after: z.string().optional().describe('ISO date to get messages after'),
});

const SearchMessagesSchema = z.object({
  query: z.string().describe('Search query text'),
  chatId: z.string().optional().describe('Filter by specific chat ID'),
  from: z.string().optional().describe('Filter by sender'),
  limit: z.number().default(20).describe('Maximum number of results'),
});

const GetUnreadMessagesSchema = z.object({
  markAsRead: z.boolean().default(false).describe('Mark messages as read after retrieval'),
});

// Advanced message interaction schemas
const MarkAsReadSchema = z.object({
  messageIds: z.array(z.string()).optional().describe('Array of message IDs to mark as read'),
  chatId: z.string().optional().describe('Mark all messages in this chat as read'),
});

const ReactToMessageSchema = z.object({
  messageId: z.string().describe('Message ID to react to'),
  emoji: z.string().describe('Emoji reaction (e.g., 👍, ❤️, 😄)'),
});

const ReplyToMessageSchema = z.object({
  messageId: z.string().describe('Message ID to reply to'),
  text: z.string().describe('Reply text'),
  mentionAuthor: z.boolean().default(true).describe('Whether to mention the original author'),
});

const ForwardMessageSchema = z.object({
  messageId: z.string().describe('Message ID to forward'),
  toChatId: z.string().describe('Chat ID to forward the message to'),
});

const DeleteMessageSchema = z.object({
  messageId: z.string().describe('Message ID to delete'),
  forEveryone: z.boolean().default(false).describe('Delete for everyone (if possible)'),
});

const DownloadMediaSchema = z.object({
  messageId: z.string().describe('Message ID containing media to download'),
  savePath: z.string().optional().describe('Custom path to save media (optional)'),
});

// Real-time monitoring and webhook schemas
const SubscribeToMessagesSchema = z.object({
  chatIds: z.array(z.string()).optional().describe('Array of chat IDs to monitor (all if not specified)'),
  messageTypes: z.array(z.string()).optional().describe('Array of message types to monitor'),
  callback: z.string().optional().describe('Webhook URL for notifications'),
});

const SetMessageWebhookSchema = z.object({
  url: z.string().url().describe('Webhook URL for message notifications'),
  events: z.array(z.string()).default(['message']).describe('Array of events to monitor'),
  secret: z.string().optional().describe('Secret for webhook authentication'),
});

const SetAutoResponseSchema = z.object({
  rules: z.array(z.object({
    trigger: z.string().describe('Text trigger for auto-response'),
    response: z.string().describe('Automatic response text'),
    chatIds: z.array(z.string()).optional().describe('Specific chats to apply this rule (all if not specified)'),
    isRegex: z.boolean().default(false).describe('Whether trigger is a regex pattern'),
    caseSensitive: z.boolean().default(false).describe('Whether trigger matching is case-sensitive'),
  })).describe('Array of auto-response rules'),
});

const GetTypingStatusSchema = z.object({
  chatId: z.string().describe('Chat ID to check typing status'),
});

const MonitorOnlineStatusSchema = z.object({
  contactIds: z.array(z.string()).describe('Array of contact IDs to monitor'),
});

class WhatsAppMcpServer {
  private server: Server;
  private whatsappClient: WhatsAppClientWrapper | null = null;
  private ttsIntegration: TTSIntegration;
  private webhookUrl: string | null = null;
  private webhookSecret: string | null = null;
  private autoResponseRules: any[] = [];
  private subscriptions: Map<string, any> = new Map();
  private monitoredContacts: Set<string> = new Set();
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
          {
            name: 'get_recent_messages',
            description: 'Fetch recent WhatsApp messages with optional filters',
            inputSchema: GetRecentMessagesSchema,
          },
          {
            name: 'get_message_by_id',
            description: 'Retrieve a specific message by its ID',
            inputSchema: GetMessageByIdSchema,
          },
          {
            name: 'get_conversation_history',
            description: 'Get message history from a specific chat',
            inputSchema: GetConversationHistorySchema,
          },
          {
            name: 'search_messages',
            description: 'Search messages by content or sender',
            inputSchema: SearchMessagesSchema,
          },
          {
            name: 'get_unread_messages',
            description: 'Fetch all unread messages',
            inputSchema: GetUnreadMessagesSchema,
          },
          {
            name: 'mark_as_read',
            description: 'Mark messages as read',
            inputSchema: MarkAsReadSchema,
          },
          {
            name: 'react_to_message',
            description: 'Add emoji reaction to a message',
            inputSchema: ReactToMessageSchema,
          },
          {
            name: 'reply_to_message',
            description: 'Reply to a specific message with quote',
            inputSchema: ReplyToMessageSchema,
          },
          {
            name: 'forward_message',
            description: 'Forward a message to another chat',
            inputSchema: ForwardMessageSchema,
          },
          {
            name: 'delete_message',
            description: 'Delete a message',
            inputSchema: DeleteMessageSchema,
          },
          {
            name: 'download_media',
            description: 'Download media from a message',
            inputSchema: DownloadMediaSchema,
          },
          {
            name: 'subscribe_to_messages',
            description: 'Subscribe to real-time message updates',
            inputSchema: SubscribeToMessagesSchema,
          },
          {
            name: 'set_message_webhook',
            description: 'Configure webhook for new messages',
            inputSchema: SetMessageWebhookSchema,
          },
          {
            name: 'set_auto_response',
            description: 'Configure automatic message responses',
            inputSchema: SetAutoResponseSchema,
          },
          {
            name: 'get_typing_status',
            description: 'Get current typing status for chats',
            inputSchema: GetTypingStatusSchema,
          },
          {
            name: 'monitor_online_status',
            description: 'Monitor contact online status',
            inputSchema: MonitorOnlineStatusSchema,
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

          case 'get_recent_messages':
            const recentParams = GetRecentMessagesSchema.parse(args);
            return await this.getRecentMessages(recentParams);

          case 'get_message_by_id':
            const messageIdParams = GetMessageByIdSchema.parse(args);
            return await this.getMessageById(messageIdParams);

          case 'get_conversation_history':
            const historyParams = GetConversationHistorySchema.parse(args);
            return await this.getConversationHistory(historyParams);

          case 'search_messages':
            const searchParams = SearchMessagesSchema.parse(args);
            return await this.searchMessages(searchParams);

          case 'get_unread_messages':
            const unreadParams = GetUnreadMessagesSchema.parse(args);
            return await this.getUnreadMessages(unreadParams);

          case 'mark_as_read':
            const markReadParams = MarkAsReadSchema.parse(args);
            return await this.markAsRead(markReadParams);

          case 'react_to_message':
            const reactParams = ReactToMessageSchema.parse(args);
            return await this.reactToMessage(reactParams);

          case 'reply_to_message':
            const replyParams = ReplyToMessageSchema.parse(args);
            return await this.replyToMessage(replyParams);

          case 'forward_message':
            const forwardParams = ForwardMessageSchema.parse(args);
            return await this.forwardMessage(forwardParams);

          case 'delete_message':
            const deleteParams = DeleteMessageSchema.parse(args);
            return await this.deleteMessage(deleteParams);

          case 'download_media':
            const downloadParams = DownloadMediaSchema.parse(args);
            return await this.downloadMedia(downloadParams);

          case 'subscribe_to_messages':
            const subscribeParams = SubscribeToMessagesSchema.parse(args);
            return await this.subscribeToMessages(subscribeParams);

          case 'set_message_webhook':
            const webhookParams = SetMessageWebhookSchema.parse(args);
            return await this.setMessageWebhook(webhookParams);

          case 'set_auto_response':
            const autoResponseParams = SetAutoResponseSchema.parse(args);
            return await this.setAutoResponse(autoResponseParams);

          case 'get_typing_status':
            const typingParams = GetTypingStatusSchema.parse(args);
            return await this.getTypingStatus(typingParams);

          case 'monitor_online_status':
            const onlineParams = MonitorOnlineStatusSchema.parse(args);
            return await this.monitorOnlineStatus(onlineParams);

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
      
      // Enable message receiving with default configuration
      const messageConfig: MessageReceivingConfig = {
        enableMessageHistory: true,
        enableWebhooks: false,
        enableAutoResponse: false,
        storageType: 'both', // Use both memory and SQLite
        maxHistorySize: 1000,
        persistMessages: true,
        retentionDays: 30,
        autoDownloadMedia: false,
        maxMediaSize: 10, // 10MB
        mediaStoragePath: './media',
        rateLimitPerMinute: 60,
        maxConcurrentProcessing: 10,
        messageQueueSize: 1000,
        encryptStorage: false,
        privacyMode: false,
        webhookRetries: 3,
        webhookTimeout: 5000
      };

      this.whatsappClient.enableMessageReceiving({
        rateLimitPerMinute: messageConfig.rateLimitPerMinute,
        enableStorage: true,
        enableWebhooks: false,
        maxQueueSize: messageConfig.messageQueueSize
      });

      const messageHandler = this.whatsappClient.getMessageHandler();
      if (messageHandler) {
        messageHandler.configureStorage(messageConfig);
        await messageHandler.initializeStorage();
      }

      console.log(`Loading WhatsApp session: ${sessionInfo.name}`);
      console.log('Initializing WhatsApp client...');
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

  private async getRecentMessages(params: z.infer<typeof GetRecentMessagesSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    const messageHandler = this.whatsappClient.getMessageHandler();
    if (!messageHandler) {
      throw new McpError(ErrorCode.InternalError, 'Message receiving not enabled');
    }

    try {
      let messages: IncomingMessage[];

      if (params.chatId) {
        messages = await messageHandler.getChatMessages(params.chatId, params.limit);
      } else {
        messages = await messageHandler.getRecentMessages(params.limit);
      }

      // Filter for unread messages if requested
      if (params.onlyUnread) {
        messages = messages.filter(msg => !msg.isRead);
      }

      // Filter media messages if not requested
      if (!params.includeMedia) {
        messages = messages.filter(msg => !msg.hasMedia);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: messages.length,
            messages: messages.map(msg => ({
              id: msg.id,
              from: msg.from,
              to: msg.to,
              body: msg.body,
              type: msg.type,
              timestamp: msg.timestamp,
              isGroup: msg.isGroup,
              author: msg.author,
              hasMedia: msg.hasMedia,
              isForwarded: msg.isForwarded,
              isRead: msg.isRead,
              mentions: msg.mentions
            }))
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to retrieve recent messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async getMessageById(params: z.infer<typeof GetMessageByIdSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    const messageHandler = this.whatsappClient.getMessageHandler();
    if (!messageHandler) {
      throw new McpError(ErrorCode.InternalError, 'Message receiving not enabled');
    }

    try {
      const message = await messageHandler.getMessage(params.messageId);

      if (!message) {
        return {
          content: [{
            type: 'text',
            text: `Message with ID ${params.messageId} not found`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(message, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to retrieve message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async getConversationHistory(params: z.infer<typeof GetConversationHistorySchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    const messageHandler = this.whatsappClient.getMessageHandler();
    if (!messageHandler) {
      throw new McpError(ErrorCode.InternalError, 'Message receiving not enabled');
    }

    try {
      const filter: MessageFilter = {
        chatId: params.chatId,
      };

      if (params.before) {
        filter.endDate = new Date(params.before);
      }

      if (params.after) {
        filter.startDate = new Date(params.after);
      }

      let messages: IncomingMessage[];
      if (params.before || params.after) {
        messages = await messageHandler.filterMessages(filter);
        messages = messages.slice(0, params.limit);
      } else {
        messages = await messageHandler.getChatMessages(params.chatId, params.limit);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            chatId: params.chatId,
            count: messages.length,
            messages: messages
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to retrieve conversation history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async searchMessages(params: z.infer<typeof SearchMessagesSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    const messageHandler = this.whatsappClient.getMessageHandler();
    if (!messageHandler) {
      throw new McpError(ErrorCode.InternalError, 'Message receiving not enabled');
    }

    try {
      let messages: IncomingMessage[];

      // Use filter if additional parameters are provided
      if (params.chatId || params.from) {
        const filter: MessageFilter = {
          searchText: params.query,
          chatId: params.chatId,
          from: params.from
        };
        messages = await messageHandler.filterMessages(filter);
        messages = messages.slice(0, params.limit);
      } else {
        // Use simple search
        messages = await messageHandler.searchMessages(params.query);
        messages = messages.slice(0, params.limit);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query: params.query,
            count: messages.length,
            messages: messages
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to search messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async getUnreadMessages(params: z.infer<typeof GetUnreadMessagesSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    const messageHandler = this.whatsappClient.getMessageHandler();
    if (!messageHandler) {
      throw new McpError(ErrorCode.InternalError, 'Message receiving not enabled');
    }

    try {
      const filter: MessageFilter = {
        isUnread: true
      };

      const messages = await messageHandler.filterMessages(filter);

      // Mark as read if requested
      if (params.markAsRead && messages.length > 0) {
        const messageIds = messages.map(msg => msg.id);
        const readCount = messageHandler.markMultipleAsRead(messageIds);
        console.log(`Marked ${readCount} messages as read`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: messages.length,
            markedAsRead: params.markAsRead ? messages.length : 0,
            messages: messages
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to retrieve unread messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async markAsRead(params: z.infer<typeof MarkAsReadSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    const messageHandler = this.whatsappClient.getMessageHandler();
    
    try {
      let markedCount = 0;

      if (params.messageIds && params.messageIds.length > 0) {
        // Mark specific messages as read
        if (messageHandler) {
          markedCount = messageHandler.markMultipleAsRead(params.messageIds);
        }
      } else if (params.chatId) {
        // Mark entire chat as read
        await this.whatsappClient.markChatAsRead(params.chatId);
        markedCount = 1; // Represent chat-level operation
      } else {
        throw new Error('Either messageIds or chatId must be provided');
      }

      return {
        content: [{
          type: 'text',
          text: `Successfully marked ${markedCount} ${params.chatId ? 'chat' : 'messages'} as read`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to mark as read: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async reactToMessage(params: z.infer<typeof ReactToMessageSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    try {
      await this.whatsappClient.reactToMessage(params.messageId, params.emoji);

      return {
        content: [{
          type: 'text',
          text: `Successfully reacted with ${params.emoji} to message ${params.messageId}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to react to message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async replyToMessage(params: z.infer<typeof ReplyToMessageSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    try {
      await this.whatsappClient.replyToMessage(params.messageId, params.text, params.mentionAuthor);

      return {
        content: [{
          type: 'text',
          text: `Successfully replied to message ${params.messageId}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to reply to message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async forwardMessage(params: z.infer<typeof ForwardMessageSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    try {
      await this.whatsappClient.forwardMessage(params.messageId, params.toChatId);

      return {
        content: [{
          type: 'text',
          text: `Successfully forwarded message ${params.messageId} to ${params.toChatId}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to forward message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async deleteMessage(params: z.infer<typeof DeleteMessageSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    try {
      await this.whatsappClient.deleteMessage(params.messageId, params.forEveryone);

      const deleteType = params.forEveryone ? 'for everyone' : 'for me';
      return {
        content: [{
          type: 'text',
          text: `Successfully deleted message ${params.messageId} ${deleteType}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to delete message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async downloadMedia(params: z.infer<typeof DownloadMediaSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    try {
      const result = await this.whatsappClient.downloadMedia(params.messageId, params.savePath);

      const isDataUri = result.startsWith('data:');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            messageId: params.messageId,
            success: true,
            result: isDataUri ? 'Media returned as base64 data URI' : `Media saved to ${result}`,
            dataUri: isDataUri ? result : undefined,
            filePath: !isDataUri ? result : undefined
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to download media: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async subscribeToMessages(params: z.infer<typeof SubscribeToMessagesSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    const messageHandler = this.whatsappClient.getMessageHandler();
    if (!messageHandler) {
      throw new McpError(ErrorCode.InternalError, 'Message receiving not enabled');
    }

    try {
      const subscriptionId = `sub_${Date.now()}`;
      
      const subscription = {
        id: subscriptionId,
        chatIds: params.chatIds || [],
        messageTypes: params.messageTypes || [],
        callback: params.callback,
        createdAt: new Date()
      };

      this.subscriptions.set(subscriptionId, subscription);

      // Set up event listeners based on subscription
      if (params.messageTypes?.includes('text') || !params.messageTypes) {
        messageHandler.onTextMessage((message) => {
          this.handleSubscriptionEvent(subscriptionId, 'text_message', message);
        });
      }

      if (params.messageTypes?.includes('media') || !params.messageTypes) {
        messageHandler.onMediaMessage((message) => {
          this.handleSubscriptionEvent(subscriptionId, 'media_message', message);
        });
      }

      if (params.messageTypes?.includes('group') || !params.messageTypes) {
        messageHandler.onGroupMessage((message) => {
          this.handleSubscriptionEvent(subscriptionId, 'group_message', message);
        });
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            subscriptionId,
            message: 'Successfully subscribed to message updates',
            subscription
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to subscribe to messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async setMessageWebhook(params: z.infer<typeof SetMessageWebhookSchema>): Promise<CallToolResult> {
    try {
      this.webhookUrl = params.url;
      this.webhookSecret = params.secret || null;

      // Test webhook by sending a ping
      if (this.webhookUrl) {
        try {
          const testPayload = {
            type: 'webhook_test',
            timestamp: new Date().toISOString(),
            message: 'WhatsApp MCP webhook configured successfully'
          };

          await this.sendWebhook(testPayload);
        } catch (webhookError) {
          console.warn('Webhook test failed:', webhookError);
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            webhookUrl: this.webhookUrl,
            events: params.events,
            hasSecret: !!this.webhookSecret,
            message: 'Webhook configured successfully'
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to set webhook: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async setAutoResponse(params: z.infer<typeof SetAutoResponseSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    const messageHandler = this.whatsappClient.getMessageHandler();
    if (!messageHandler) {
      throw new McpError(ErrorCode.InternalError, 'Message receiving not enabled');
    }

    try {
      this.autoResponseRules = params.rules;

      // Set up auto-response listener
      messageHandler.onMessage(async (message) => {
        await this.handleAutoResponse(message);
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            rulesCount: this.autoResponseRules.length,
            rules: this.autoResponseRules,
            message: 'Auto-response rules configured successfully'
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to set auto-response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async getTypingStatus(params: z.infer<typeof GetTypingStatusSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    try {
      // Note: WhatsApp Web.js has limited typing status support
      // This is a basic implementation
      const chat = await this.whatsappClient.getChatById(params.chatId);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            chatId: params.chatId,
            isTyping: false, // WhatsApp Web.js doesn't provide real-time typing status
            note: 'Typing status monitoring is limited in WhatsApp Web.js',
            lastSeen: chat ? 'Available through chat.lastSeen if contact allows' : 'Chat not found'
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to get typing status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async monitorOnlineStatus(params: z.infer<typeof MonitorOnlineStatusSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    try {
      // Add contacts to monitoring set
      params.contactIds.forEach(id => this.monitoredContacts.add(id));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            monitoredContacts: Array.from(this.monitoredContacts),
            note: 'Online status monitoring is limited in WhatsApp Web.js. Real presence updates may not be available.',
            totalMonitored: this.monitoredContacts.size
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to monitor online status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  // Helper methods for webhook and auto-response functionality
  private async handleSubscriptionEvent(subscriptionId: string, eventType: string, message: any): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    // Check if message matches subscription filters
    if (subscription.chatIds.length > 0 && 
        !subscription.chatIds.includes(message.from) && 
        !subscription.chatIds.includes(message.to)) {
      return;
    }

    // Send webhook notification if configured
    if (subscription.callback || this.webhookUrl) {
      const payload = {
        subscriptionId,
        eventType,
        message: {
          id: message.id,
          from: message.from,
          to: message.to,
          body: message.body,
          type: message.type,
          timestamp: message.timestamp,
          isGroup: message.isGroup
        },
        timestamp: new Date().toISOString()
      };

      try {
        await this.sendWebhook(payload, subscription.callback);
      } catch (error) {
        console.error('Failed to send webhook:', error);
      }
    }
  }

  private async handleAutoResponse(message: IncomingMessage): Promise<void> {
    if (!this.whatsappClient || !message.body) return;

    for (const rule of this.autoResponseRules) {
      // Check if rule applies to this chat
      if (rule.chatIds && rule.chatIds.length > 0) {
        if (!rule.chatIds.includes(message.from) && !rule.chatIds.includes(message.to)) {
          continue;
        }
      }

      // Check if message matches trigger
      let matches = false;
      if (rule.isRegex) {
        const regex = new RegExp(rule.trigger, rule.caseSensitive ? 'g' : 'gi');
        matches = regex.test(message.body);
      } else {
        const messageText = rule.caseSensitive ? message.body : message.body.toLowerCase();
        const trigger = rule.caseSensitive ? rule.trigger : rule.trigger.toLowerCase();
        matches = messageText.includes(trigger);
      }

      if (matches) {
        try {
          // Send auto-response
          await this.whatsappClient.sendTextMessage({
            chatId: message.from,
            text: rule.response
          });
          
          console.log(`Auto-response sent to ${message.from}: ${rule.response}`);
          break; // Only respond with the first matching rule
        } catch (error) {
          console.error('Failed to send auto-response:', error);
        }
      }
    }
  }

  private async sendWebhook(payload: any, customUrl?: string): Promise<void> {
    const url = customUrl || this.webhookUrl;
    if (!url) return;

    try {
      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent': 'WhatsApp-MCP-Server/1.0.0'
      };

      if (this.webhookSecret) {
        const crypto = await import('crypto');
        const signature = crypto
          .createHmac('sha256', this.webhookSecret)
          .update(JSON.stringify(payload))
          .digest('hex');
        headers['X-WhatsApp-Signature'] = `sha256=${signature}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Webhook delivery failed:', error);
      throw error;
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