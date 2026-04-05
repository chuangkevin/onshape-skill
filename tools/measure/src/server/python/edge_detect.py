"""
OpenCV edge detection and contour extraction for Photo Measure.

Usage:
    python edge_detect.py <image_path> [roi_json] [epsilon] [--max-size N] [--min-contour-area R]

Input:
    image_path: Path to image file
    roi_json: Optional JSON string with ROI: {"x": 0, "y": 0, "width": 800, "height": 600}
    epsilon: Optional approxPolyDP factor (default 0.005)
    --max-size N: Resize image so longest edge <= N px before processing.
                  Output coordinates are scaled back to original image size.
                  Default: 2048.
    --min-contour-area R: Minimum contour area as ratio of image area (default 0.005 = 0.5%).

Output:
    JSON to stdout with contours and circles detected.
"""

import sys
import json
import numpy as np
import cv2


def detect_edges(
    image_path: str,
    roi: dict | None = None,
    epsilon_factor: float = 0.005,
    max_size: int = 2048,
    min_contour_area_ratio: float = 0.005,
) -> dict:
    """Run edge detection and contour extraction on an image."""
    img = cv2.imread(image_path)
    if img is None:
        return {"error": f"Cannot read image: {image_path}", "contours": [], "circles": []}

    orig_h, orig_w = img.shape[:2]
    scale = 1.0

    # Resize so longest edge <= max_size (process at lower res, scale coords back)
    longest = max(orig_w, orig_h)
    if longest > max_size:
        scale = longest / max_size
        new_w = int(round(orig_w / scale))
        new_h = int(round(orig_h / scale))
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # Scale ROI coordinates to resized image space
    if roi and scale != 1.0:
        roi = {
            "x": roi["x"] / scale,
            "y": roi["y"] / scale,
            "width": roi["width"] / scale,
            "height": roi["height"] / scale,
        }

    # Crop to ROI if provided
    if roi:
        x, y, w, h = int(roi["x"]), int(roi["y"]), int(roi["width"]), int(roi["height"])
        # Clamp to image bounds
        x = max(0, x)
        y = max(0, y)
        w = min(w, img.shape[1] - x)
        h = min(h, img.shape[0] - y)
        img = img[y:y+h, x:x+w]
        roi_offset = (x, y)
    else:
        roi_offset = (0, 0)

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # CLAHE contrast enhancement for low-contrast objects
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Adaptive Canny thresholds via Otsu binarization
    otsu_value, _ = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    canny_low = max(30, 0.5 * otsu_value)
    canny_high = max(60, float(otsu_value))
    edges = cv2.Canny(blurred, canny_low, canny_high)

    # Dilate to close gaps
    kernel = np.ones((5, 5), np.uint8)
    edges = cv2.dilate(edges, kernel, iterations=1)

    # Find contours
    contours_raw, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Filter and simplify contours
    contours_result = []
    min_area = img.shape[0] * img.shape[1] * min_contour_area_ratio

    for contour in contours_raw:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue

        # Simplify with approxPolyDP
        peri = cv2.arcLength(contour, True)
        epsilon = epsilon_factor * peri
        approx = cv2.approxPolyDP(contour, epsilon, True)

        # Convert to point list with ROI offset, scaled back to original image coords
        points = []
        for pt in approx:
            points.append([
                int(round((pt[0][0] + roi_offset[0]) * scale)),
                int(round((pt[0][1] + roi_offset[1]) * scale))
            ])

        bbox = cv2.boundingRect(contour)
        contours_result.append({
            "contour_px": points,
            "area_px": float(area) * (scale * scale),
            "bounding_box": {
                "x": int(round((bbox[0] + roi_offset[0]) * scale)),
                "y": int(round((bbox[1] + roi_offset[1]) * scale)),
                "width": int(round(bbox[2] * scale)),
                "height": int(round(bbox[3] * scale)),
            },
            "point_count_original": len(contour),
            "point_count_simplified": len(approx),
        })

    # Sort by area (largest first)
    contours_result.sort(key=lambda c: c["area_px"], reverse=True)

    # Circle detection with HoughCircles
    circles_result = []
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=30,
        param1=100,
        param2=40,
        minRadius=5,
        maxRadius=0,
    )

    if circles is not None:
        for circle in circles[0]:
            cx, cy, r = circle
            circles_result.append({
                "center_px": {
                    "x": (float(cx) + roi_offset[0]) * scale,
                    "y": (float(cy) + roi_offset[1]) * scale,
                },
                "radius_px": float(r) * scale,
            })

    return {
        "contours": contours_result,
        "circles": circles_result,
        "image_size": {"width": orig_w, "height": orig_h},
    }


if __name__ == "__main__":
    # Parse --max-size and --min-contour-area from argv before positional args
    max_size = 2048
    min_contour_area_ratio = 0.005
    argv = list(sys.argv[1:])

    if "--max-size" in argv:
        idx = argv.index("--max-size")
        if idx + 1 < len(argv):
            max_size = int(argv[idx + 1])
            argv = argv[:idx] + argv[idx + 2:]
        else:
            argv = argv[:idx]

    if "--min-contour-area" in argv:
        idx = argv.index("--min-contour-area")
        if idx + 1 < len(argv):
            min_contour_area_ratio = float(argv[idx + 1])
            argv = argv[:idx] + argv[idx + 2:]
        else:
            argv = argv[:idx]

    if len(argv) < 1:
        print(json.dumps({"error": "Usage: edge_detect.py <image_path> [roi_json] [epsilon] [--max-size N] [--min-contour-area R]"}))
        sys.exit(1)

    image_path = argv[0]
    roi = None
    epsilon = 0.005

    # Parse remaining positional args: [roi_json] [epsilon]
    # roi_json must be a JSON object (dict), epsilon is a float
    for arg in argv[1:]:
        try:
            parsed = json.loads(arg)
            if isinstance(parsed, dict):
                roi = parsed
            elif isinstance(parsed, (int, float)):
                epsilon = float(parsed)
        except (json.JSONDecodeError, ValueError):
            # Try as epsilon float
            try:
                epsilon = float(arg)
            except ValueError:
                pass

    result = detect_edges(image_path, roi, epsilon, max_size, min_contour_area_ratio)
    print(json.dumps(result))
