## MODIFIED Requirements

### Requirement: Python subprocess edge detection
The system SHALL resolve the full Python executable path at startup (via `where` on Windows / `which` on Unix) and use that absolute path for all subprocess calls. Before invoking edge detection, the system SHALL resize the input image to a maximum dimension of 1024px (preserving aspect ratio) to ensure consistent performance and memory usage across varying source image sizes.

#### Scenario: Edge detection with resolved Python path
- **WHEN** the user triggers edge detection on an uploaded photo
- **THEN** the system SHALL invoke the Python subprocess using the previously resolved absolute path (not a bare `python` command) and pass the resized (max 1024px) image as input

#### Scenario: Large image resize before processing
- **WHEN** the input image exceeds 1024px on its longest dimension
- **THEN** the system SHALL resize it to 1024px (preserving aspect ratio) before passing it to the Python edge detection subprocess

#### Scenario: Small image passthrough
- **WHEN** the input image is 1024px or smaller on its longest dimension
- **THEN** the system SHALL pass it to edge detection without resizing

---

### Requirement: Python availability check
The system SHALL detect the full Python executable path at startup using `where` (Windows) or `which` (Unix). The system SHALL support a `PYTHON_PATH` environment variable that, when set, overrides automatic detection. The resolved path SHALL be cached for the lifetime of the process.

#### Scenario: Automatic Python detection
- **WHEN** the application starts and `PYTHON_PATH` is not set
- **THEN** the system SHALL run `where python` (Windows) or `which python3` (Unix) to resolve the absolute path and cache it

#### Scenario: PYTHON_PATH override
- **WHEN** the `PYTHON_PATH` environment variable is set
- **THEN** the system SHALL use that value as the Python executable path without running `where`/`which`

#### Scenario: Cached path reuse
- **WHEN** a Python subprocess is needed after startup
- **THEN** the system SHALL reuse the cached absolute path without re-detecting

---

### Requirement: Graceful fallback
When Python path detection fails (neither automatic detection nor `PYTHON_PATH` yields a valid executable), the system SHALL display a clear, actionable error message to the user and disable edge-detection features gracefully without crashing.

#### Scenario: Python not found on system
- **WHEN** `where`/`which` fails and `PYTHON_PATH` is not set
- **THEN** the system SHALL display an error message: "Python not found. Please install Python or set the PYTHON_PATH environment variable." and disable edge detection features

#### Scenario: PYTHON_PATH points to invalid path
- **WHEN** `PYTHON_PATH` is set but the path does not exist or is not executable
- **THEN** the system SHALL display an error message: "PYTHON_PATH points to an invalid executable: <path>. Please correct it." and fall back to automatic detection

#### Scenario: Edge detection requested without Python
- **WHEN** the user triggers edge detection but Python is unavailable
- **THEN** the system SHALL show a non-blocking notification explaining that edge detection is unavailable and suggest installing Python
