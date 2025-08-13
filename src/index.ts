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
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import { WhatsAppClientWrapper } from './whatsapp-client.js';
import { TTSIntegration } from './tts-integration.js';
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

class WhatsAppMcpServer {
  private server: Server;
  private whatsappClient: WhatsAppClientWrapper | null = null;
  private ttsIntegration: TTSIntegration;

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
            name: 'initialize_whatsapp',
            description: 'Initialize WhatsApp client with QR code authentication',
            inputSchema: {
              type: 'object',
              properties: {
                sessionName: {
                  type: 'string',
                  description: 'Name for the WhatsApp session',
                  default: 'whatsapp-mcp',
                },
                authTimeoutMs: {
                  type: 'number',
                  description: 'Authentication timeout in milliseconds',
                  default: 60000,
                },
              },
            },
          },
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
            inputSchema: SendTextMessageSchema,
          },
          {
            name: 'send_audio_message',
            description: 'Send an audio file or voice note via WhatsApp',
            inputSchema: SendAudioMessageSchema,
          },
          {
            name: 'send_tts_message',
            description: 'Generate TTS audio and send as voice note (requires ElevenLabs integration)',
            inputSchema: SendTTSMessageSchema,
          },
          {
            name: 'send_media_from_url',
            description: 'Send media (image, video, audio) from a URL',
            inputSchema: SendMediaFromUrlSchema,
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
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'initialize_whatsapp':
            return await this.initializeWhatsApp(args);

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

  private async initializeWhatsApp(args: any): Promise<CallToolResult> {
    try {
      const config: WhatsAppConfig = {
        sessionName: args.sessionName || 'whatsapp-mcp',
        qrCodeTimeout: 60000,
        authTimeoutMs: args.authTimeoutMs || 60000,
        userDataDir: './whatsapp_session',
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

      console.log('Initializing WhatsApp client...');
      await this.whatsappClient.initialize();

      return {
        content: [{
          type: 'text',
          text: 'WhatsApp client initialized successfully! You can now send messages.',
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to initialize WhatsApp: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async getWhatsAppStatus(): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      return {
        content: [{
          type: 'text',
          text: 'WhatsApp client not initialized. Use initialize_whatsapp tool first.',
        }],
      };
    }

    const status = this.whatsappClient.getStatus();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(status, null, 2),
      }],
    };
  }

  private async sendTextMessage(params: z.infer<typeof SendTextMessageSchema>): Promise<CallToolResult> {
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    try {
      await this.whatsappClient.sendTextMessage(params);
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
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    try {
      await this.whatsappClient.sendAudioMessage(params);
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
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    try {
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
      await this.whatsappClient.sendAudioMessage({
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
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    try {
      await this.whatsappClient.sendMediaFromUrl(params.chatId, params.url, params.caption);
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
    if (!this.whatsappClient) {
      throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
    }

    try {
      const contacts = await this.whatsappClient.getContacts();
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
      
      if (!this.whatsappClient) {
        throw new McpError(ErrorCode.InternalError, 'WhatsApp client not initialized');
      }

      // Send text notification
      await this.whatsappClient.sendTextMessage({ chatId, text: textMessage });

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
          await this.whatsappClient.sendAudioMessage({
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

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('WhatsApp MCP server running on stdio');
  }
}

const server = new WhatsAppMcpServer();
server.run().catch(console.error);