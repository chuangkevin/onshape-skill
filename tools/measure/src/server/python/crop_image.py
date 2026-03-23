"""
Crop an image to a ROI using OpenCV and save to output path.

Usage:
    python crop_image.py <input_path> <x> <y> <width> <height> <output_path>

Output:
    JSON: {"ok": true, "width": w, "height": h}
    or  : {"error": "..."}
"""

import sys
import json
import cv2


def main() -> None:
    if len(sys.argv) < 7:
        print(json.dumps({"error": "Usage: crop_image.py <input> <x> <y> <w> <h> <output>"}))
        sys.exit(1)

    input_path = sys.argv[1]
    x, y, w, h = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
    output_path = sys.argv[6]

    img = cv2.imread(input_path)
    if img is None:
        print(json.dumps({"error": f"Cannot read image: {input_path}"}))
        sys.exit(1)

    ih, iw = img.shape[:2]
    # Clamp ROI to image bounds
    x = max(0, min(x, iw - 1))
    y = max(0, min(y, ih - 1))
    w = max(1, min(w, iw - x))
    h = max(1, min(h, ih - y))

    cropped = img[y:y + h, x:x + w]
    cv2.imwrite(output_path, cropped)
    print(json.dumps({"ok": True, "width": int(w), "height": int(h)}))


if __name__ == "__main__":
    main()
