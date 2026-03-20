## ADDED Requirements

### Requirement: Parallel Gemini analysis
The system SHALL fire multiple Gemini 2.5 Flash requests concurrently, each using a different API key from the pool. Tasks: OCR caliper readings, OCR labels + WebSearch, and overlay+photo interpretation.

#### Scenario: Parallel execution
- **WHEN** user triggers "Analyze" on a project with 3 photos
- **THEN** at least 3 concurrent Gemini requests are fired (using different API keys), and results are collected when all complete

### Requirement: OCR caliper reading
The system SHALL send close-up photos containing digital calipers to Gemini and extract numeric readings (value + unit).

#### Scenario: Read caliper display
- **WHEN** a photo shows a digital caliper displaying "27.8 mm"
- **THEN** the system extracts { value: 27.8, unit: "mm" } from the Gemini response

### Requirement: Label OCR + WebSearch
The system SHALL read text labels from photos (model numbers, specs, manufacturer) and use Gemini's grounding/search to find official dimensions.

#### Scenario: Find official specs
- **WHEN** a photo contains label text "L17C3P53" and "11.1V 3980mAh"
- **THEN** the system extracts the model number, searches for official dimensions, and returns any found specs (length, width, height)

### Requirement: Overlay interpretation
The system SHALL send the composite photo+overlay image to Gemini and request interpretation of the user's drawn contour in context of the visible part.

#### Scenario: Interpret user drawing
- **WHEN** user has drawn a rough L-shaped contour over a battery photo
- **THEN** Gemini interprets "user has outlined the battery body, which is L-shaped with a raised section on the upper-middle area" and provides estimated dimensions

### Requirement: Retry with failover
If any Gemini request fails with HTTP 429, the system SHALL automatically retry with a different API key from the pool (via getGeminiApiKeyExcluding).

#### Scenario: Automatic retry
- **WHEN** an OCR request fails with 429 using keyA
- **THEN** the system retries the same request with keyB and returns the successful result

### Requirement: Analysis results storage
The system SHALL store all AI analysis results in the SQLite database, associated with the project and photo. Results SHALL include raw Gemini responses and parsed structured data.

#### Scenario: Persist results
- **WHEN** AI analysis completes for a photo
- **THEN** the raw response and parsed data are stored in the database and retrievable via API
