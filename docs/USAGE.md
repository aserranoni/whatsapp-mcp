# WhatsApp MCP Server Usage Guide

## Quick Start

1. **Build and run the server:**
   ```bash
   cd whatsapp-mcp-server
   npm install
   npm run build
   npm start
   ```

2. **First-time setup:** When you run the server, a QR code will appear. Scan it with your WhatsApp mobile app.

3. **Test the connection:** Use the `get_whatsapp_status` tool to verify the connection.

## Integrating with Claude Code

Add to your Claude Code MCP configuration (`~/.claude/mcp_servers.json`):

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

## Common Use Cases

### 1. Task Completion Notifications

When Claude completes a task, automatically send a WhatsApp notification:

```javascript
// Claude would use this tool after completing work
send_task_completion_notification({
  chatId: "5511999999999@c.us",  // Your phone number
  taskName: "Code Review",
  summary: "Reviewed 5 files, found 2 issues, created 3 suggestions",
  includeAudio: true
})
```

### 2. Manual Notifications

Send custom messages:

```javascript
send_text_message({
  chatId: "5511999999999@c.us",
  text: "🚀 Deployment completed successfully!"
})
```

### 3. Voice Messages

Send text-to-speech messages:

```javascript
send_tts_message({
  chatId: "5511999999999@c.us",
  text: "Your build has finished running and all tests are passing",
  voiceName: "Rachel",
  speed: 1.0
})
```

## Finding Your Chat ID

### For Individual Contacts

Your phone number format: `[country_code][phone_number]@c.us`

Examples:
- US: `11234567890@c.us` (1 + area code + number)
- Brazil: `5511999999999@c.us` (55 + area code + number)
- UK: `447123456789@c.us` (44 + number without leading 0)

### For Groups

1. Use the `list_contacts` tool with `includeGroups: true`
2. Find your group in the list
3. Use the group's ID (format: `[numbers]@g.us`)

## Setting Up Automated Notifications

### Method 1: Using Claude Code Hooks

Create a completion hook in your Claude Code settings to automatically notify via WhatsApp:

```json
{
  "hooks": {
    "post_task_completion": "send_task_completion_notification --chatId YOUR_CHAT_ID --taskName $TASK_NAME --summary $TASK_SUMMARY"
  }
}
```

### Method 2: Integration in Custom Scripts

If you have automation scripts, integrate WhatsApp notifications:

```bash
#!/bin/bash
# Your deployment script
deploy_app.sh

if [ $? -eq 0 ]; then
  claude mcp whatsapp send_task_completion_notification \\
    --chatId "5511999999999@c.us" \\
    --taskName "Deployment" \\
    --summary "Application deployed successfully to production"
fi
```

## Audio Configuration

### Using ElevenLabs (Premium)

1. Get API key from [ElevenLabs](https://elevenlabs.io)
2. Add to `.env`: `ELEVENLABS_API_KEY=your_key_here`
3. Enjoy high-quality voice notifications

### Using System TTS (Free)

- **macOS**: Uses built-in `say` command
- **Windows**: Requires additional setup
- **Linux**: Requires espeak or festival

## Advanced Usage

### Batch Notifications

Send multiple notifications:

```javascript
// Get contacts first
const contacts = list_contacts({ includeGroups: false });

// Send to multiple people
contacts.forEach(contact => {
  send_text_message({
    chatId: contact.id,
    text: "System maintenance completed ✅"
  });
});
```

### Audio File Management

The server automatically:
- Saves TTS files to `./audio/` directory
- Cleans up old files periodically
- Supports multiple audio formats

### Custom Audio Messages

Send your own audio files:

```javascript
send_audio_message({
  chatId: "5511999999999@c.us",
  filePath: "/path/to/custom-notification.mp3",
  sendAsVoiceNote: true,
  caption: "Custom notification audio"
})
```

## Best Practices

### 1. Rate Limiting
- Don't send messages too frequently
- WhatsApp may flag accounts for spam
- Recommended: Max 1 message per minute per contact

### 2. Message Content
- Keep notifications concise but informative
- Use emojis for better visibility: ✅ ❌ 🚀 ⚠️
- Include relevant context (time, status, next steps)

### 3. Error Handling
- Always check WhatsApp status before sending
- Handle authentication failures gracefully
- Implement fallback notifications (email, Slack, etc.)

### 4. Security
- Never commit session data to version control
- Use environment variables for sensitive data
- Regularly rotate API keys

## Troubleshooting

### "Client not initialized" Error
```javascript
// Always initialize first
initialize_whatsapp({
  sessionName: "my-session",
  authTimeoutMs: 60000
});

// Wait for ready status
get_whatsapp_status();
```

### QR Code Not Appearing
1. Check console output for errors
2. Ensure port 3000 isn't blocked
3. Try running with `DEBUG=true`

### Audio Issues
1. Check file permissions on audio directory
2. Verify audio file format compatibility
3. Test system TTS: `say "test" -o test.aiff`

### Rate Limiting
If messages aren't being delivered:
1. Check WhatsApp Web for any warnings
2. Reduce message frequency
3. Restart the session if blocked

## Examples Repository

For more examples, check the `examples/` directory:
- Basic task notification
- Batch messaging
- Custom audio alerts
- Integration with CI/CD pipelines

## Support

- 📖 Documentation: README.md
- 🐛 Issues: GitHub Issues
- 💬 Discussions: GitHub Discussions
- 📧 Contact: See repository for contact info