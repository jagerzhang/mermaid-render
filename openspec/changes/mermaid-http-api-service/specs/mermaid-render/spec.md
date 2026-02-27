## ADDED Requirements

### Requirement: Mermaid Code Rendering
The system SHALL accept Mermaid diagram code and render it into image format.

#### Scenario: Render flowchart to SVG
- **WHEN** user submits valid Mermaid flowchart code with format "svg"
- **THEN** system returns SVG image data with Content-Type "image/svg+xml"

#### Scenario: Render sequence diagram to PNG
- **WHEN** user submits valid Mermaid sequence diagram code with format "png"
- **THEN** system returns PNG image data with Content-Type "image/png"

#### Scenario: Invalid Mermaid code
- **WHEN** user submits invalid Mermaid code
- **THEN** system returns HTTP 400 with error message describing the syntax error

### Requirement: Theme Support
The system SHALL support multiple Mermaid themes for rendering.

#### Scenario: Render with default theme
- **WHEN** user submits code without specifying theme
- **THEN** system renders using "default" theme

#### Scenario: Render with forest theme
- **WHEN** user submits code with theme "forest"
- **THEN** system renders using forest theme with green color scheme

#### Scenario: Render with dark theme
- **WHEN** user submits code with theme "dark"
- **THEN** system renders using dark theme with dark background

#### Scenario: Render with neutral theme
- **WHEN** user submits code with theme "neutral"
- **THEN** system renders using neutral theme with grayscale colors

#### Scenario: Invalid theme
- **WHEN** user submits code with invalid theme name
- **THEN** system returns HTTP 400 with list of valid themes

### Requirement: Output Size Configuration
The system SHALL support custom output dimensions for rendered images.

#### Scenario: Custom width and height
- **WHEN** user specifies width=1200 and height=800
- **THEN** system renders image with specified dimensions

#### Scenario: Default dimensions
- **WHEN** user does not specify dimensions
- **THEN** system renders image with auto-calculated dimensions based on content

### Requirement: Background Color Configuration
The system SHALL support custom background color for rendered images.

#### Scenario: Custom background color
- **WHEN** user specifies backgroundColor="transparent"
- **THEN** system renders image with transparent background

#### Scenario: Default background
- **WHEN** user does not specify background color
- **THEN** system renders image with white background
