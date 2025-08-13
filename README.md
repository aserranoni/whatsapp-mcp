# WhatsApp MCP Server

A Model Context Protocol (MCP) server that enables WhatsApp integration with text-to-speech and audio notification capabilities. Send text messages, audio files, and voice notes via WhatsApp, with built-in TTS support for automated task completion notifications.

[![npm version](https://badge.fury.io/js/whatsapp-mcp-server.svg)](https://badge.fury.io/js/whatsapp-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)

## Features

- 📱 **WhatsApp Integration**: Send and receive messages via WhatsApp Web
- 🎵 **Audio Messages**: Send audio files and voice notes
- 🗣️ **Text-to-Speech**: Convert text to speech using ElevenLabs or system TTS
- 🔔 **Task Notifications**: Automated notifications when tasks are completed
- 📋 **Contact Management**: List and manage WhatsApp contacts
- 🔄 **Session Persistence**: Maintain WhatsApp sessions across restarts
- 🌐 **Media Support**: Send images, videos, and other media from URLs
- 🔒 **Secure**: Environment-based configuration with no hard-coded credentials
- 🛡️ **Advanced Auth System**: Intelligent authentication with multiple strategies
- 📊 **Auth State Management**: Real-time authentication status monitoring
- ⚡ **Auto-Strategy Selection**: Automatic selection of best auth method
- 🔧 **Comprehensive Error Handling**: Detailed error messages with recovery suggestions

## Requirements

- Node.js 18.0.0 or higher
- WhatsApp account for QR code authentication
- Optional: ElevenLabs API key for premium TTS
- Optional: ffmpeg for audio format conversion

## Installation

### From npm (Recommended)

```bash
npm install -g whatsapp-mcp-server
```

### From Source

1. Clone the repository:
```bash
git clone https://github.com/your-username/whatsapp-mcp-server.git
cd whatsapp-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Quick Start

### 1. First-Time Authentication

Before using the MCP server, you need to authenticate with WhatsApp using a QR code:

```bash
# Run the initialization script
npm run auth

# Or with a custom session name
npm run auth my-session
```

This will:
- Display a QR code in your terminal
- Wait for you to scan it with your WhatsApp mobile app
- Save the authentication session for future use
- Exit once authentication is complete

**Important**: You only need to do this once. The session will persist across restarts.

### 2. Using with MCP Clients

Once authenticated, configure your MCP client (like Claude Desktop) to use the server:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "whatsapp-mcp-server",
      "env": {
        "ELEVENLABS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 3. Test the Connection

You can now test sending a message:
```bash
cp .env.example .env
# Edit .env with your settings
```

3. Run the server:
```bash
whatsapp-mcp-server
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Optional ElevenLabs API key for premium TTS
ELEVENLABS_API_KEY=your_api_key_here

# WhatsApp session configuration
WHATSAPP_SESSION_NAME=whatsapp-mcp-session
WHATSAPP_AUTH_TIMEOUT_MS=60000

# Audio settings
AUDIO_OUTPUT_DIR=./audio
TTS_DEFAULT_VOICE=Rachel
```

### WhatsApp Authentication System

The server features an advanced authentication system with multiple strategies:

#### Authentication Strategies

1. **Session Restore Strategy**: Automatically uses existing authenticated sessions
2. **QR Code Strategy**: Fallback method requiring QR code scanning

#### Configuration Options

```bash
# WhatsApp session configuration
WHATSAPP_SESSION_NAME=whatsapp-mcp-session
WHATSAPP_SESSION_DIR=./whatsapp_session
WHATSAPP_SESSION_PREFIX=session-
WHATSAPP_AUTH_TIMEOUT_MS=30000
WHATSAPP_QR_TIMEOUT_MS=60000
WHATSAPP_MAX_RETRIES=3
WHATSAPP_RETRY_DELAY_MS=5000
```

#### Authentication Flow

The system automatically:
1. **Detects** existing sessions and validates them
2. **Selects** the optimal authentication strategy
3. **Monitors** authentication state with real-time updates
4. **Provides** detailed error messages with recovery suggestions
5. **Maintains** session persistence across restarts

#### Auth State Monitoring

You can monitor authentication states:

- `UNINITIALIZED`: Client not yet started
- `INITIALIZING`: Client starting up
- `WAITING_FOR_QR`: QR code required for authentication
- `AUTHENTICATING`: Authentication in progress
- `AUTHENTICATED`: Successfully authenticated
- `READY`: Client ready for use
- `FAILED`: Authentication failed
- `DISCONNECTED`: Client disconnected
- `DESTROYED`: Client destroyed/cleaned up

## Usage

### Running the MCP Server

```bash
npm start
```

The server will start and wait for MCP client connections via stdio.

### Integrating with Claude Code

To use this server with Claude Code, add it to your MCP configuration:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "whatsapp-mcp-server"
    }
  }
}
```

Or if installed locally:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/path/to/whatsapp-mcp-server/dist/index.js"]
    }
  }
}
```

## Available Tools

### `get_whatsapp_status`
Get current WhatsApp client connection and authentication status.

**Returns:**
- Connection status, authentication state, session name, phone number
- Auth state information and error details if any
- Timestamp of last connection

**Note**: Authentication now happens automatically when any WhatsApp operation is attempted. No manual initialization required!

### `send_text_message`
Send a text message to a WhatsApp contact or group.

**Parameters:**
- `chatId`: WhatsApp chat ID (e.g., "5511999999999@c.us")
- `text`: Message text to send

### `send_audio_message`
Send an audio file or voice note.

**Parameters:**
- `chatId`: WhatsApp chat ID
- `filePath`: Absolute path to the audio file
- `caption` (optional): Caption for the audio message
- `sendAsVoiceNote` (optional): Send as voice note (default: true)

### `send_tts_message`
Generate text-to-speech audio and send as voice note.

**Parameters:**
- `chatId`: WhatsApp chat ID
- `text`: Text to convert to speech
- `voiceName` (optional): Voice name for TTS
- `speed` (optional): Speech speed (0.5-2.0)

### `send_task_completion_notification`
Send a comprehensive task completion notification with optional audio.

**Parameters:**
- `chatId`: WhatsApp chat ID
- `taskName`: Name of the completed task
- `summary`: Brief summary of what was accomplished
- `includeAudio` (optional): Include audio notification (default: true)

### `list_contacts`
Get list of WhatsApp contacts.

**Parameters:**
- `includeGroups` (optional): Include group chats (default: false)

### `get_whatsapp_status`
Check the current connection status of the WhatsApp client.

## Chat ID Format

WhatsApp chat IDs follow this format:
- **Individual contacts**: `[country_code][phone_number]@c.us`
  - Example: `5511999999999@c.us` (Brazilian number)
- **Groups**: `[group_id]@g.us`
  - Example: `120363023456789012@g.us`

## Text-to-Speech Integration

The server supports multiple TTS providers:

1. **ElevenLabs** (Premium): Requires API key, high-quality voices
2. **System TTS** (Fallback): Uses macOS `say` command or similar

### ElevenLabs Integration

If you have an ElevenLabs API key:

1. Set `ELEVENLABS_API_KEY` in your `.env` file
2. The server will automatically use ElevenLabs for TTS generation
3. Fallback to system TTS if ElevenLabs fails

## Examples

### Basic Task Completion Notification

```javascript
// This would be called by Claude when a task is completed
{
  "tool": "send_task_completion_notification",
  "arguments": {
    "chatId": "5511999999999@c.us",
    "taskName": "Database Migration",
    "summary": "Successfully migrated 10,000 records to the new schema",
    "includeAudio": true
  }
}
```

### Send Custom Audio Message

```javascript
{
  "tool": "send_audio_message",
  "arguments": {
    "chatId": "5511999999999@c.us",
    "filePath": "/path/to/audio/notification.mp3",
    "sendAsVoiceNote": true
  }
}
```

## Troubleshooting

### Authentication System

The new authentication system provides detailed error messages with recovery suggestions:

#### Common Auth Errors

- **`SESSION_NOT_FOUND`**: Run `npm run auth` to create a new session
- **`SESSION_EXPIRED`**: Run `npm run auth` to re-authenticate with QR code  
- **`QR_CODE_REQUIRED`**: Run `npm run auth` and scan the displayed QR code
- **`INITIALIZATION_TIMEOUT`**: Check network connection or increase timeout
- **`AUTHENTICATION_FAILED`**: Clear session data and re-authenticate

#### Auth Recovery Steps

1. **Check auth status:**
   ```bash
   # The system will show detailed status information
   # including current state and suggested actions
   ```

2. **Clear problematic sessions:**
   ```bash
   rm -rf ./whatsapp_session
   npm run auth
   ```

3. **Use environment variables for custom configuration:**
   ```bash
   export WHATSAPP_AUTH_TIMEOUT_MS=60000
   export WHATSAPP_SESSION_DIR=/custom/path
   ```

For detailed authentication troubleshooting, see [AUTHENTICATION.md](docs/AUTHENTICATION.md).

### Legacy Issues

#### Audio Issues

1. Check that audio files exist and are readable
2. Supported formats: MP3, WAV, OGG, M4A
3. For system TTS on macOS, ensure `say` command works
4. Install ffmpeg for audio format conversion

#### Other Common Errors

- **"TTS generation failed"**: Check ElevenLabs API key or system TTS availability
- **"Client not ready"**: Wait for authentication to complete automatically

## Development

### Building from Source

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Security Considerations

- WhatsApp sessions are stored locally in `./whatsapp_session/`
- Never commit session data to version control
- ElevenLabs API keys should be kept secure
- This uses an unofficial WhatsApp API - use at your own risk
- Consider rate limiting to avoid WhatsApp spam detection

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review WhatsApp Web.js documentation
3. Open an issue on the repository