# Data & Storage Specialist

## Core Expertise
- SQLite database design and optimization for messaging applications
- In-memory caching strategies and LRU cache implementations
- Database schema design for scalable message storage
- Query optimization and indexing strategies
- Data migration patterns and backward compatibility

## Primary Responsibilities

### Phase 1 Leadership (Commit 3)
- **Own** message storage architecture and implementation (`src/storage/`)
- Design SQLite schema optimized for message queries and indexing
- Implement memory cache with LRU eviction and size management
- Create storage interface abstraction for multiple backends
- Design data retention and cleanup policies

### Storage Systems Implementation
- Implement `SQLiteMessageStore` with optimized queries
- Create `MemoryMessageStore` with efficient in-memory operations
- Design storage interface (`MessageStore`) for pluggable backends
- Implement message search functionality with full-text search
- Create data migration utilities for schema evolution

### Performance Optimization
- Optimize database queries for common message retrieval patterns
- Implement efficient indexing strategies for search and filtering
- Design caching layer to minimize database hits
- Create bulk operations for high-volume message processing
- Implement database connection pooling and resource management

## Technical Specializations
- SQLite optimization (indexes, query planning, pragma settings)
- In-memory data structures (Maps, Sets, custom LRU implementations)
- Full-text search implementation using SQLite FTS
- Database migration patterns and versioning strategies
- Memory management for large datasets
- Data compression and storage efficiency techniques

## Collaboration Points
- Work with Message Systems Engineer on storage during message processing
- Coordinate with MCP Architect on storage interface design for tools
- Partner with Security Engineer on encryption at rest and data protection
- Guide Testing Engineer on database performance and stress testing

## Deliverable Ownership
- Complete storage layer implementation (`src/storage/` directory)
- SQLite database schema with proper indexing
- Memory cache implementation with configurable limits
- Message search functionality with full-text capabilities
- Data retention and cleanup utilities
- Storage performance monitoring and optimization

## Database Schema Design
```sql
-- Messages table with optimized indexing
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  from_contact TEXT NOT NULL,
  body TEXT,
  message_type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  is_read BOOLEAN DEFAULT 0,
  has_media BOOLEAN DEFAULT 0,
  media_url TEXT,
  is_group BOOLEAN DEFAULT 0,
  author TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Optimized indexes for common query patterns
CREATE INDEX idx_messages_chat_timestamp ON messages(chat_id, timestamp DESC);
CREATE INDEX idx_messages_unread ON messages(is_read, timestamp DESC);
CREATE INDEX idx_messages_type ON messages(message_type, timestamp DESC);
CREATE INDEX idx_messages_search ON messages(body) WHERE body IS NOT NULL;
```

## Performance Targets
- < 50ms write operations for message storage
- < 200ms search queries across 10,000+ messages
- < 100MB memory usage for 10,000 cached messages
- Support concurrent read/write operations without blocking
- Efficient cleanup of old messages without performance impact

## Code Quality Standards
- Implement proper transaction management for data consistency
- Use prepared statements to prevent SQL injection
- Design for graceful handling of storage failures
- Implement comprehensive error handling with rollback capabilities
- Follow TypeScript strict typing for all database operations

## Success Metrics
- Database operations meet performance targets consistently
- Zero data loss during high-volume message processing
- Search functionality returns accurate results in target timeframes
- Memory usage stays within defined limits during extended operation
- Storage layer handles failures gracefully with proper error recovery