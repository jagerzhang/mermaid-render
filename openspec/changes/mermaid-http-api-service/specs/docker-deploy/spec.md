## ADDED Requirements

### Requirement: Dockerfile
The system SHALL provide a Dockerfile for building container image.

#### Scenario: Build Docker image
- **WHEN** user runs "docker build -t mermaid-render ."
- **THEN** Docker builds image successfully with all dependencies

#### Scenario: Image contains Chromium dependencies
- **WHEN** Docker image is built
- **THEN** image includes all system libraries required by Puppeteer/Chromium

### Requirement: Docker Compose Configuration
The system SHALL provide docker-compose.yml for easy deployment.

#### Scenario: Start service with docker-compose
- **WHEN** user runs "docker-compose up -d"
- **THEN** service starts and listens on configured port

#### Scenario: Stop service with docker-compose
- **WHEN** user runs "docker-compose down"
- **THEN** service stops gracefully

### Requirement: Container Runtime Configuration
The system SHALL support configuration via environment variables.

#### Scenario: Custom port configuration
- **WHEN** PORT environment variable is set to 8080
- **THEN** service listens on port 8080

#### Scenario: Default port
- **WHEN** PORT environment variable is not set
- **THEN** service listens on port 3000

### Requirement: Container Health Check
The system SHALL include health check configuration in Docker setup.

#### Scenario: Docker health check
- **WHEN** container is running
- **THEN** Docker can verify container health via /health endpoint

### Requirement: Multi-stage Build
The system SHALL use multi-stage Docker build to minimize image size.

#### Scenario: Build stage separation
- **WHEN** Docker image is built
- **THEN** final image contains only runtime dependencies, not dev dependencies

### Requirement: Non-root User
The system SHALL run as non-root user inside container for security.

#### Scenario: Container user
- **WHEN** container starts
- **THEN** application process runs as non-root user
