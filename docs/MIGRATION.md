# Migration Guide - New Authentication System

This guide helps you migrate from the previous version to the new authentication architecture.

## What's Changed

### Major Improvements

✅ **Automatic Authentication** - No more manual `initialize_whatsapp` calls  
✅ **Smart Strategy Selection** - System picks the best auth method  
✅ **Real-time State Monitoring** - Track auth progress with detailed states  
✅ **Comprehensive Error Handling** - Clear error messages with recovery steps  
✅ **Environment Configuration** - Full config via environment variables  
✅ **Session Management** - Improved session discovery and validation  

### Breaking Changes

❌ **Removed `initialize_whatsapp` tool** - Authentication happens automatically  
❌ **Changed error message format** - Now structured with recovery suggestions  

## Migration Steps

### 1. Update Dependencies

```bash
npm update whatsapp-mcp-server
```

### 2. Remove Manual Initialization

**Before:**
```typescript
// Old approach - manual initialization required
await tools.initialize_whatsapp({
  sessionName: 'my-session',
  authTimeoutMs: 30000
});
```

**After:**
```typescript
// New approach - automatic initialization
// Just start using WhatsApp tools directly
await tools.send_text_message({
  chatId: '5511999999999@c.us',
  text: 'Hello World!'
});
// Authentication happens automatically!
```

### 3. Update Error Handling (Optional)

**Before:**
```typescript
try {
  await whatsappOperation();
} catch (error) {
  console.error('Error:', error.message);
}
```

**After:**
```typescript
import { isAuthError, logAuthError } from 'whatsapp-mcp-server';

try {
  await whatsappOperation();
} catch (error) {
  if (isAuthError(error)) {
    // Structured auth error with recovery suggestions
    logAuthError(error, 'Operation Context');
    console.log(`Recovery: ${error.suggestedAction}`);
  } else {
    console.error('Error:', error.message);
  }
}
```

### 4. Add Environment Configuration (Optional)

Create or update your `.env` file:

```bash
# Optional: Customize auth behavior
WHATSAPP_SESSION_NAME=my-custom-session
WHATSAPP_AUTH_TIMEOUT_MS=60000
WHATSAPP_QR_TIMEOUT_MS=300000
WHATSAPP_SESSION_DIR=./custom-sessions

# Existing variables still work
ELEVENLABS_API_KEY=your-api-key
```

### 5. Update MCP Configuration (No Change Required)

Your existing MCP configuration continues to work:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "whatsapp-mcp-server",
      "env": {
        "ELEVENLABS_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Compatibility Notes

### ✅ Fully Compatible

- **Existing sessions** work without changes
- **All WhatsApp tools** have the same API
- **MCP configuration** requires no updates
- **Environment variables** are backward compatible
- **Audio and TTS features** unchanged

### ⚠️ Behavior Changes

- **Authentication timing**: Now happens on first tool use instead of explicit init
- **Error messages**: More detailed with structured format
- **Session handling**: Automatic session discovery and selection

### 📈 New Features Available

- **Auth state monitoring**: Track authentication progress
- **Strategy information**: See which auth method is being used
- **Enhanced debugging**: Detailed auth history and state info

## Code Examples

### Basic Usage (No Changes Needed)

```typescript
// This code works exactly the same as before
await tools.send_text_message({
  chatId: '5511999999999@c.us',
  text: 'Migration complete!'
});
```

### Advanced Usage (New Features)

```typescript
// New: Get auth status
const status = await tools.get_whatsapp_status();
console.log('Auth state:', status.authState);
console.log('Auth message:', status.authMessage);

// New: Enhanced error handling
try {
  await tools.send_text_message({ /* ... */ });
} catch (error) {
  if (isAuthError(error)) {
    console.log(`Error code: ${error.code}`);
    console.log(`Recoverable: ${error.recoverable}`);
    console.log(`Suggestion: ${error.suggestedAction}`);
  }
}
```

## Troubleshooting Migration

### Issue: "Cannot find module" errors

**Solution:** Rebuild after update
```bash
npm run build
```

### Issue: Old sessions not working

**Solution:** Clear and recreate
```bash
rm -rf whatsapp_session/
npm run auth
```

### Issue: Different error messages

**Expected behavior** - error messages are now more helpful:
```
Before: "Authentication failed"
After:  "WhatsApp session has expired for 'my-session'. 
         💡 Run 'npm run auth' to re-authenticate with a new QR code"
```

### Issue: Missing initialize_whatsapp tool

**Expected behavior** - tool was removed because initialization is automatic:
```javascript
// Remove this - no longer needed
// await tools.initialize_whatsapp({ ... });

// Authentication happens automatically on first use
await tools.send_text_message({ ... });
```

## Performance Impact

### Improvements

- **Faster startup**: No mandatory initialization step
- **Smart session reuse**: Automatic detection of existing sessions  
- **Reduced redundancy**: Authentication only when needed
- **Better error recovery**: Automatic retry with different strategies

### Resource Usage

- **Memory**: Slightly higher due to state management (~1-2MB)
- **CPU**: Minimal overhead from state tracking
- **Storage**: Same session storage format
- **Network**: No change in network usage

## Testing Your Migration

### 1. Basic Functionality Test

```bash
# Test auth status
node -e "
const { tools } = require('./dist');
tools.get_whatsapp_status().then(console.log);
"

# Test message sending  
node -e "
const { tools } = require('./dist');
tools.send_text_message({
  chatId: 'YOUR_PHONE@c.us',
  text: 'Migration test successful!'
}).then(() => console.log('Success!'));
"
```

### 2. Auth System Test

Run the new auth demo:
```bash
node examples/auth-demo.js
```

### 3. Error Handling Test

```bash
# Test with invalid session to see new error format
rm -rf whatsapp_session/
node -e "
const { tools } = require('./dist');
tools.send_text_message({
  chatId: 'test@c.us', 
  text: 'test'
}).catch(console.error);
"
```

## Rolling Back (If Needed)

If you need to rollback for any reason:

```bash
# Install previous version
npm install whatsapp-mcp-server@<previous-version>

# Restore old initialization pattern
await tools.initialize_whatsapp({
  sessionName: 'my-session'
});
```

## Getting Help

### Resources

1. **[Authentication Documentation](AUTHENTICATION.md)** - Detailed auth system guide
2. **[Main README](../README.md)** - Updated usage information  
3. **[Examples](../examples/)** - Sample code with new features
4. **[Tests](../src/__tests__/)** - Test cases showing correct usage

### Support

If you encounter issues:

1. **Check the troubleshooting section** in the main README
2. **Review error messages** - they now include recovery suggestions
3. **Run auth demo** - `node examples/auth-demo.js` for diagnostics
4. **Open an issue** with error details and auth state information

## Summary

The migration is designed to be **seamless for basic usage** while providing **powerful new features** for advanced users. Most code will work without changes, and the new authentication system provides better reliability and user experience.

Key takeaways:
- ✅ **No code changes required** for basic usage
- ✅ **Better error messages** with clear recovery steps  
- ✅ **Automatic authentication** eliminates manual initialization
- ✅ **Backward compatible** with existing sessions and configuration
- ✅ **New features available** for enhanced monitoring and control

Welcome to the improved WhatsApp MCP Server! 🎉