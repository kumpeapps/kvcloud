# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-12-10

### Added
- Initial project structure and foundation
- Backend FastAPI application with async support
- Frontend Angular 17 application with standalone components
- Database-agnostic design with SQLAlchemy (PostgreSQL, MySQL, SQLite)
- Role-Based Access Control (RBAC) using Casbin
- Plugin system for drop-in extensions
- Module system for organized feature development
- Proxmox cluster management foundation
- Proxmox node configuration and management
- Basic VM operations (list, status, start, stop, restart)
- JWT-based authentication
- User registration and login
- Docker containers for backend and frontend
- Docker Compose configurations for production and development
- Database migrations with Alembic
- API documentation with FastAPI's automatic docs
- Angular routing with lazy loading
- Auth guard for protected routes
- HTTP interceptor for JWT tokens
- Comprehensive README documentation
- Architecture documentation
- Contributing guidelines
- Nginx configuration for frontend production deployment

### Security
- Bcrypt password hashing
- JWT token-based authentication
- RBAC implementation with configurable policies
- SQL injection prevention via ORM
- XSS prevention via Angular sanitization
- Configurable CORS policies

[0.1.0]: https://github.com/kumpeapps/kvcloud/releases/tag/v0.1.0
