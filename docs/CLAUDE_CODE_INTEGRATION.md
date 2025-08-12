# Claude Code Integration Guide

## Adding WhatsApp MCP Server to Claude Code

### Step 1: Configure MCP Server

Add this to your Claude Code MCP configuration file (usually `~/.claude/mcp_servers.json` or similar):

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/full/path/to/whatsapp-mcp-server/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

Replace `/full/path/to/whatsapp-mcp-server/` with the actual path to your project.

### Step 2: First Setup

1. **Initialize WhatsApp** (one-time setup):
   ```
   Use the initialize_whatsapp tool
   Scan QR code with your WhatsApp app
   ```

2. **Find your Chat ID**:
   ```
   Use list_contacts tool to find your phone number
   Format: [country_code][number]@c.us (e.g., 5511999999999@c.us)
   ```

### Step 3: Configure Your Default Chat

Set your default chat ID in the `.env` file:
```bash
DEFAULT_CHAT_ID=5511999999999@c.us
```

## Usage Examples

### Basic Task Notification

When Claude completes any task, you can use:

```javascript
send_task_completion_notification({
  chatId: "5511999999999@c.us",
  taskName: "Code Review",
  summary: "Reviewed authentication system, found 3 issues, created pull request with fixes",
  includeAudio: true
})
```

### Custom Messages

```javascript
send_text_message({
  chatId: "5511999999999@c.us", 
  text: "🚀 Deployment completed successfully!"
})
```

### Voice Notifications

```javascript
send_tts_message({
  chatId: "5511999999999@c.us",
  text: "Your build has finished running and all tests are passing",
  voiceName: "Rachel"
})
```

## Phone Number Formats

### Individual Contacts
Format: `[country_code][phone_number]@c.us`

Examples:
- 🇺🇸 US: `11234567890@c.us`
- 🇧🇷 Brazil: `5511999999999@c.us`  
- 🇬🇧 UK: `447123456789@c.us`
- 🇩🇪 Germany: `4915123456789@c.us`

### Groups
Format: `[group_id]@g.us`
Use `list_contacts` with `includeGroups: true` to find group IDs.

## Automation Ideas

### 1. Build Completion Notifications

```bash
#!/bin/bash
# In your CI/CD pipeline
npm run build
if [ $? -eq 0 ]; then
  claude-code mcp whatsapp send_task_completion_notification \
    --chatId "YOUR_CHAT_ID" \
    --taskName "Production Build" \
    --summary "Build completed successfully, deployed to production" \
    --includeAudio true
fi
```

### 2. Code Review Reminders

```javascript
// After creating a PR
send_text_message({
  chatId: "TEAM_GROUP_ID@g.us",
  text: "📋 New PR ready for review: https://github.com/your-repo/pull/123"
})
```

### 3. Error Alerts

```javascript
// In error handling
send_tts_message({
  chatId: "YOUR_CHAT_ID",
  text: "Alert: Critical error detected in production system",
  speed: 0.9
})
```

## Troubleshooting

### Common Issues

1. **"WhatsApp client not initialized"**
   - Solution: Run `initialize_whatsapp` first
   - Check that WhatsApp session is valid

2. **"Invalid chat ID"**
   - Use `list_contacts` to find correct format
   - Ensure country code is included
   - For groups, use @g.us suffix

3. **"TTS generation failed"**
   - Add ElevenLabs API key to `.env`
   - System TTS should work as fallback
   - Check audio directory permissions

4. **"Authentication failed"**
   - Clear session: `rm -rf whatsapp_session/`
   - Re-run `initialize_whatsapp`
   - Scan QR code within 60 seconds

### Logs and Debugging

Enable debug mode in `.env`:
```bash
DEBUG=true
LOG_LEVEL=debug
```

Check server status:
```javascript
get_whatsapp_status()
```

## Security Best Practices

1. **Never commit session data**
   - `whatsapp_session/` is in `.gitignore`
   - Keep authentication tokens secure

2. **Rate limiting**
   - Don't send messages too frequently
   - WhatsApp may detect spam and block account

3. **Use environment variables**
   - Store sensitive data in `.env`
   - Don't hardcode phone numbers in scripts

4. **Backup considerations**
   - WhatsApp sessions can be restored from `whatsapp_session/`
   - Back up this directory for continuity

## Advanced Configuration

### Multiple Chat Targets

```javascript
const targets = [
  "YOUR_PHONE@c.us",      // Personal notifications
  "TEAM_GROUP@g.us",      // Team updates
  "ALERTS_GROUP@g.us"     // Error alerts
];

targets.forEach(chatId => {
  send_task_completion_notification({
    chatId,
    taskName: "System Update",
    summary: "All services updated successfully",
    includeAudio: chatId === "YOUR_PHONE@c.us" // Only audio for personal
  });
});
```

### Custom Audio Messages

```javascript
// Use pre-recorded audio files
send_audio_message({
  chatId: "YOUR_CHAT_ID",
  filePath: "/path/to/custom-alert.mp3",
  sendAsVoiceNote: true,
  caption: "System Alert"
})
```

## Support

- 📖 Main documentation: `README.md`
- 🔧 Usage guide: `USAGE.md`
- 🧪 Test script: `node real-test.js`
- 🐛 Issues: GitHub Issues