## ADDED Requirements

### Requirement: Generate Diagram Endpoint
The system SHALL provide a POST endpoint at /api/mermaid/generate for generating diagrams.

#### Scenario: Successful SVG generation
- **WHEN** client sends POST request to /api/mermaid/generate with valid JSON body containing "code" field
- **THEN** system returns HTTP 200 with SVG image in response body

#### Scenario: Successful PNG generation
- **WHEN** client sends POST request with "code" and "format": "png"
- **THEN** system returns HTTP 200 with PNG image in response body

#### Scenario: Missing code field
- **WHEN** client sends POST request without "code" field
- **THEN** system returns HTTP 400 with message "Mermaid code is required"

### Requirement: Request Body Validation
The system SHALL validate all request parameters.

#### Scenario: Valid format parameter
- **WHEN** client sends request with format "svg" or "png"
- **THEN** system accepts the request and uses specified format

#### Scenario: Invalid format parameter
- **WHEN** client sends request with invalid format value
- **THEN** system returns HTTP 400 with message listing valid formats

#### Scenario: Valid theme parameter
- **WHEN** client sends request with theme "default", "forest", "dark", or "neutral"
- **THEN** system accepts the request and uses specified theme

#### Scenario: Invalid theme parameter
- **WHEN** client sends request with invalid theme value
- **THEN** system returns HTTP 400 with message listing valid themes

### Requirement: Response Headers
The system SHALL set appropriate response headers for generated images.

#### Scenario: SVG response headers
- **WHEN** generating SVG output
- **THEN** response includes Content-Type: image/svg+xml

#### Scenario: PNG response headers
- **WHEN** generating PNG output
- **THEN** response includes Content-Type: image/png

### Requirement: Error Handling
The system SHALL handle errors gracefully and return meaningful error messages.

#### Scenario: Rendering error
- **WHEN** Mermaid rendering fails due to internal error
- **THEN** system returns HTTP 500 with error details

#### Scenario: Timeout error
- **WHEN** rendering takes longer than 30 seconds
- **THEN** system returns HTTP 504 with timeout message

### Requirement: Health Check Endpoint
The system SHALL provide a health check endpoint for monitoring.

#### Scenario: Health check success
- **WHEN** client sends GET request to /health
- **THEN** system returns HTTP 200 with {"status": "ok"}
