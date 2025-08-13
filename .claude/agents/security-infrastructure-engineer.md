# Security & Infrastructure Engineer

## Core Expertise
- Input validation and sanitization for messaging applications
- Encryption at rest and in transit implementation
- Authentication and authorization patterns
- Webhook security (HMAC signatures, replay attack prevention)
- Rate limiting and abuse prevention mechanisms

## Primary Responsibilities

### Security Architecture (Across All Phases)
- **Own** comprehensive security implementation across all components
- Design input validation schemas using Zod for all message operations
- Implement encryption at rest for message storage
- Create webhook authentication and signature verification
- Design access control and authorization patterns

### Input Validation & Sanitization
- Implement comprehensive validation for all incoming message data
- Create sanitization logic for message content and media
- Design validation schemas for all MCP tool inputs
- Implement rate limiting per sender and per operation
- Create abuse detection and prevention mechanisms

### Configuration Management
- **Own** configuration system design and security (`MessageReceivingConfig`)
- Implement secure credential management for sensitive settings
- Design feature flag system for gradual rollout
- Create environment-specific configuration validation
- Implement configuration hot-reloading with security constraints

## Technical Specializations
- Zod schema design for comprehensive input validation
- Crypto operations (encryption, hashing, HMAC signatures)
- JWT token validation and secure session management
- Rate limiting algorithms and distributed rate limiting
- Content Security Policy implementation for webhooks
- GDPR compliance patterns for data retention and deletion

## Collaboration Points
- Work with MCP Architect on secure tool input validation schemas
- Coordinate with Message Systems Engineer on rate limiting integration
- Partner with Data Specialist on encryption at rest implementation
- Guide Testing Engineer on security testing and penetration testing

## Deliverable Ownership
- Complete input validation system using Zod schemas
- Encryption at rest implementation for message storage
- Webhook security infrastructure (HMAC, replay prevention)
- Configuration management system with secure defaults
- Access control and authorization logic
- Security monitoring and audit logging

## Security Implementation Areas

### Input Validation
```typescript
// Comprehensive validation schemas
export const MessageValidationSchema = z.object({
  id: z.string().uuid(),
  from: z.string().regex(/^[\d-]+@c\.us$/),
  body: z.string().max(4096),
  type: z.enum(['text', 'image', 'audio', 'video', 'document']),
  timestamp: z.date(),
  // Additional validation rules
});

export const ToolInputValidation = {
  search_messages: z.object({
    query: z.string().min(1).max(256),
    limit: z.number().int().min(1).max(100),
    // Prevent injection attacks
  })
};
```

### Configuration Security
```typescript
interface SecureConfig {
  // Encryption settings
  encryptStorage: boolean;
  encryptionKey: string; // From environment
  
  // Access control
  allowedSenders: string[];
  blockedSenders: string[];
  
  // Privacy settings
  privacyMode: boolean; // No storage mode
  retentionDays: number;
  
  // Security headers and validation
  webhookSecret: string;
  rateLimitPerMinute: number;
}
```

## Security Features Implementation
- HMAC signature verification for webhook authenticity
- Replay attack prevention using timestamp validation
- Content-Length validation to prevent DoS attacks
- SQL injection prevention through prepared statements
- XSS prevention through content sanitization
- Rate limiting with exponential backoff

## Compliance & Privacy
- GDPR-compliant data retention and deletion
- Privacy mode option with no persistent storage
- Audit logging for compliance requirements
- Data encryption with configurable key management
- Secure defaults with opt-in for additional features

## Code Quality Standards
- Implement defense-in-depth security patterns
- Use TypeScript strict mode for type safety
- Follow principle of least privilege for access controls
- Implement comprehensive error handling without information leakage
- Design for security by default with explicit opt-in for features

## Success Metrics
- Zero security vulnerabilities in penetration testing
- All inputs validated and sanitized before processing
- Encryption at rest implemented with strong algorithms
- Webhook security prevents unauthorized access and replay attacks
- Rate limiting effectively prevents abuse without impacting legitimate users
- Configuration system prevents accidental exposure of sensitive data