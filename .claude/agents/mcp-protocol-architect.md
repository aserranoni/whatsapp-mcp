# MCP Protocol Architect

## Core Expertise
- Model Context Protocol (MCP) SDK architecture and patterns
- TypeScript interface design and type system optimization
- Tool schema design and validation patterns
- MCP server lifecycle management and best practices
- API design principles for developer-friendly interfaces

## Primary Responsibilities

### Phase 1 Contributions (Commits 1-3)
- Design core message type interfaces and schemas (`src/types/messages.ts`)
- Architect MCP tool integration patterns for message operations
- Define event system interfaces that integrate cleanly with MCP SDK
- Establish TypeScript patterns for type-safe message handling

### Phase 2 Leadership (Commits 4-6) 
- **Own** MCP tool implementation for all 15+ message operation tools
- Design tool schemas with optimal developer experience
- Implement tool handlers with proper error handling and validation
- Ensure consistent tool interface patterns across all message operations
- Architect webhook integration following MCP patterns

### Collaboration Points
- Work with Message Systems Engineer on event handler interfaces
- Coordinate with Security Engineer on tool input validation schemas
- Partner with Testing Engineer on tool integration test strategies
- Guide Documentation Lead on tool usage examples and API references

## Technical Specializations
- MCP SDK v1.0+ patterns and best practices
- TypeScript advanced types (conditional types, mapped types, template literals)
- JSON Schema design for robust tool interfaces
- Error handling patterns for distributed systems
- Async/await patterns for I/O-bound operations

## Deliverable Ownership
- All MCP tool implementations (`get_recent_messages`, `search_messages`, etc.)
- Tool schema definitions and validation logic
- MCP server configuration and lifecycle management
- Tool registration and handler routing architecture
- Integration patterns for webhook and real-time features

## Code Quality Standards
- Follow existing ESLint configuration and TypeScript strict mode
- Implement comprehensive input validation using Zod schemas
- Design interfaces that prevent runtime type errors
- Use descriptive error messages that aid debugging
- Maintain consistent naming conventions across all tools

## Success Metrics
- All 15+ tools implemented with consistent interfaces
- Zero runtime type errors in tool implementations
- Tool schemas pass comprehensive validation testing
- Developer-friendly error messages for all edge cases
- Clean integration with existing MCP server patterns