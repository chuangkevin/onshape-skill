## ADDED Requirements

### Requirement: Python subprocess edge detection
The system SHALL call a Python script via child_process.spawn() that uses OpenCV to detect edges in a specified region of a photo. Input: image path + ROI as JSON. Output: contour points as JSON on stdout.

#### Scenario: Extract contour from ROI
- **WHEN** the system calls edge_detect.py with image path and ROI { x: 50, y: 30, width: 800, height: 600 }
- **THEN** the script returns a JSON array of contour points [[x1,y1], [x2,y2], ...] in pixel coordinates

### Requirement: ROI from user drawing
The system SHALL derive the OpenCV region of interest (ROI) from the user's overlay drawing bounding box, expanded by 10% padding.

#### Scenario: ROI calculation
- **WHEN** user's drawing has bounding box (100, 50) to (500, 400)
- **THEN** the ROI sent to OpenCV is (60, 15) to (540, 435) with 10% padding

### Requirement: Contour simplification
The Python script SHALL use approxPolyDP to simplify detected contours, reducing noise while preserving shape. The epsilon parameter SHALL be configurable.

#### Scenario: Simplified polygon output
- **WHEN** edge detection finds a contour with 500 points and epsilon=2.0
- **THEN** the output contour has significantly fewer points (e.g., 20-50) while maintaining the overall shape

### Requirement: Circle detection
The Python script SHALL use HoughCircles to detect circular features (holes, screw holes) within the ROI.

#### Scenario: Detect screw holes
- **WHEN** the ROI contains 3 visible screw holes
- **THEN** the script returns detected circles with center coordinates and radii in pixels

### Requirement: Python availability check
The server SHALL verify Python and opencv-python availability on startup and return a clear error if not found.

#### Scenario: Python not installed
- **WHEN** the server starts and Python is not in PATH
- **THEN** the server logs a warning with installation instructions and marks OpenCV features as unavailable

### Requirement: Graceful fallback
If OpenCV processing fails (Python error, poor image quality), the system SHALL fall back to using the user's overlay drawing coordinates directly.

#### Scenario: OpenCV failure fallback
- **WHEN** edge_detect.py returns an error (e.g., no contours found)
- **THEN** the system uses the user's drawn polyline coordinates (converted to mm via scale calibration) as the contour
