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

1. Install the package globally:
```bash
npm install -g whatsapp-mcp-server
```

2. Create a configuration file:
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

### WhatsApp Authentication

On first run, you'll need to scan a QR code with your WhatsApp mobile app to authenticate. The session will be saved for future use.

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

### `initialize_whatsapp`
Initialize the WhatsApp client and authenticate via QR code.

**Parameters:**
- `sessionName` (optional): Name for the WhatsApp session
- `authTimeoutMs` (optional): Authentication timeout in milliseconds

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

### WhatsApp Authentication Issues

1. Make sure your phone has internet connection
2. QR codes expire after 60 seconds - scan quickly
3. Only one WhatsApp Web session can be active at a time
4. Clear session data if authentication persistently fails:
   ```bash
   rm -rf ./whatsapp_session
   ```

### Audio Issues

1. Check that audio files exist and are readable
2. Supported formats: MP3, WAV, OGG, M4A
3. For system TTS on macOS, ensure `say` command works
4. Install ffmpeg for audio format conversion

### Common Errors

- **"WhatsApp client not initialized"**: Run `initialize_whatsapp` tool first
- **"Authentication failed"**: Clear session data and re-authenticate
- **"TTS generation failed"**: Check ElevenLabs API key or system TTS availability

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