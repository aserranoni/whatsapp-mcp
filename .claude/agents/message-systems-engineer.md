# Message Systems Engineer

## Core Expertise
- Event-driven architecture using Node.js EventEmitter patterns
- Real-time message processing and queue management
- Rate limiting algorithms and back-pressure handling
- WhatsApp Web.js integration patterns and lifecycle management
- High-throughput message processing optimization

## Primary Responsibilities

### Phase 1 Leadership (Commits 2-3)
- **Own** message handler and event system implementation (`src/handlers/message-handler.ts`)
- Design event emitter architecture for scalable message processing
- Implement rate limiting and queue management systems
- Create message processing pipeline with error recovery
- Integrate WhatsApp Web.js events with internal message system

### Phase 2 Contributions (Commits 4-6)
- Implement real-time monitoring tools (`monitor_online_status`, `get_typing_status`)
- Design webhook delivery system with retry logic
- Create message subscription and filtering mechanisms
- Optimize message processing performance for high-volume scenarios

### Real-time Features (Commit 6)
- **Own** webhook infrastructure and delivery system
- Implement real-time message subscription patterns
- Design auto-response system with intelligent rule matching
- Create typing status monitoring and online presence tracking

## Technical Specializations
- Node.js EventEmitter patterns and custom event architectures
- Message queue implementations (in-memory and persistent)
- Rate limiting algorithms (token bucket, sliding window)
- WebSocket integration for real-time updates
- Stream processing patterns for high-throughput messaging
- Circuit breaker patterns for external service integration

## Collaboration Points
- Work with MCP Architect on event system interfaces and tool integration
- Coordinate with Data Specialist on message persistence during processing
- Partner with Security Engineer on rate limiting and abuse prevention
- Guide Testing Engineer on load testing and performance validation

## Deliverable Ownership
- Message handler with event-driven processing (`MessageHandler` class)
- Rate limiting and queue management systems (`RateLimiter` class)
- Webhook delivery infrastructure with retry logic
- Real-time monitoring and subscription systems
- Auto-response engine with rule matching
- WhatsApp Web.js integration and lifecycle management

## Performance Targets
- Process 100+ concurrent messages without blocking
- < 100ms message processing latency
- Handle rate limiting gracefully with queue management
- Webhook delivery with exponential backoff retry
- Memory-efficient event handling for long-running processes

## Code Quality Standards
- Implement proper error handling with graceful degradation
- Use TypeScript strict mode with comprehensive type safety
- Follow async/await patterns for all I/O operations
- Implement comprehensive logging for debugging and monitoring
- Design for testability with dependency injection patterns

## Success Metrics
- Handle 100+ simultaneous messages without performance degradation
- < 0.1% message loss rate during high-volume processing
- Webhook delivery success rate > 99% with proper retry logic
- Rate limiting prevents abuse while maintaining user experience
- Event system scales without memory leaks in long-running processes