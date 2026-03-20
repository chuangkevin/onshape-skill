"""
OpenCV edge detection and contour extraction for Photo Measure.

Usage:
    python edge_detect.py <image_path> [roi_json]

Input:
    image_path: Path to image file
    roi_json: Optional JSON string with ROI: {"x": 0, "y": 0, "width": 800, "height": 600}

Output:
    JSON to stdout with contours and circles detected.
"""

import sys
import json
import numpy as np
import cv2


def detect_edges(image_path: str, roi: dict | None = None, epsilon_factor: float = 0.005) -> dict:
    """Run edge detection and contour extraction on an image."""
    img = cv2.imread(image_path)
    if img is None:
        return {"error": f"Cannot read image: {image_path}", "contours": [], "circles": []}

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

    # Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Canny edge detection
    edges = cv2.Canny(blurred, 50, 150)

    # Dilate to close gaps
    kernel = np.ones((3, 3), np.uint8)
    edges = cv2.dilate(edges, kernel, iterations=1)

    # Find contours
    contours_raw, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Filter and simplify contours
    contours_result = []
    min_area = img.shape[0] * img.shape[1] * 0.001  # Minimum 0.1% of image area

    for contour in contours_raw:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue

        # Simplify with approxPolyDP
        peri = cv2.arcLength(contour, True)
        epsilon = epsilon_factor * peri
        approx = cv2.approxPolyDP(contour, epsilon, True)

        # Convert to point list with ROI offset
        points = []
        for pt in approx:
            points.append([
                int(pt[0][0]) + roi_offset[0],
                int(pt[0][1]) + roi_offset[1]
            ])

        bbox = cv2.boundingRect(contour)
        contours_result.append({
            "contour_px": points,
            "area_px": float(area),
            "bounding_box": {
                "x": int(bbox[0]) + roi_offset[0],
                "y": int(bbox[1]) + roi_offset[1],
                "width": int(bbox[2]),
                "height": int(bbox[3]),
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
                    "x": float(cx) + roi_offset[0],
                    "y": float(cy) + roi_offset[1],
                },
                "radius_px": float(r),
            })

    return {
        "contours": contours_result,
        "circles": circles_result,
        "image_size": {"width": img.shape[1], "height": img.shape[0]},
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: edge_detect.py <image_path> [roi_json]"}))
        sys.exit(1)

    image_path = sys.argv[1]
    roi = None
    if len(sys.argv) >= 3:
        try:
            roi = json.loads(sys.argv[2])
        except json.JSONDecodeError:
            print(json.dumps({"error": f"Invalid ROI JSON: {sys.argv[2]}"}))
            sys.exit(1)

    epsilon = 0.005
    if len(sys.argv) >= 4:
        epsilon = float(sys.argv[3])

    result = detect_edges(image_path, roi, epsilon)
    print(json.dumps(result))
