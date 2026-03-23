#!/usr/bin/env python3
"""
Phase 1 segmentation using FastSAM.

Usage:
    python fastsam_segment.py --image <path> [--roi <x1,y1,x2,y2>] [--model <path>]

Output (stdout): JSON with contours, image_size.
On error: JSON with error message and empty contours.
"""

import argparse
import json
import os
import sys


def parse_args():
    parser = argparse.ArgumentParser(description="FastSAM Phase 1 segmentation")
    parser.add_argument("--image", required=True, help="Path to input image")
    parser.add_argument(
        "--roi",
        default=None,
        help="Optional region of interest: x1,y1,x2,y2 (pixel coordinates)",
    )
    parser.add_argument(
        "--model",
        default="/app/models/FastSAM-s.pt",
        help="Path to FastSAM model weights (default: /app/models/FastSAM-s.pt)",
    )
    return parser.parse_args()


def resolve_model_path(model_arg: str) -> str | None:
    """Return a valid model path, or None if no model file is found."""
    if os.path.isfile(model_arg):
        return model_arg
    # Fallback: look for FastSAM-s.pt in the current working directory
    fallback = os.path.join(os.getcwd(), "FastSAM-s.pt")
    if os.path.isfile(fallback):
        return fallback
    return None


def parse_roi(roi_str: str) -> tuple[int, int, int, int] | None:
    """Parse ROI string 'x1,y1,x2,y2' into a tuple of ints."""
    try:
        parts = [int(v.strip()) for v in roi_str.split(",")]
        if len(parts) != 4:
            return None
        return (parts[0], parts[1], parts[2], parts[3])
    except ValueError:
        return None


def output_error(message: str):
    print(json.dumps({"error": message, "contours": []}))


def main():
    args = parse_args()

    # --- Try to import required libraries ---
    try:
        import cv2
        import numpy as np
        from ultralytics import FastSAM
    except ImportError:
        print(json.dumps({"error": "fastsam_unavailable"}))
        sys.exit(0)

    # --- Resolve model path ---
    model_path = resolve_model_path(args.model)
    if model_path is None:
        print(json.dumps({"error": "fastsam_unavailable"}))
        sys.exit(0)

    # --- Load image ---
    try:
        image_bgr = cv2.imread(args.image)
        if image_bgr is None:
            output_error(f"cannot_read_image: {args.image}")
            sys.exit(0)
    except Exception as exc:
        output_error(f"image_load_error: {exc}")
        sys.exit(0)

    full_h, full_w = image_bgr.shape[:2]

    # --- Parse ROI and crop ---
    roi = None
    x_offset = 0
    y_offset = 0

    if args.roi:
        roi = parse_roi(args.roi)
        if roi is None:
            output_error("invalid_roi: expected x1,y1,x2,y2")
            sys.exit(0)
        x1, y1, x2, y2 = roi
        # Clamp to image bounds
        x1 = max(0, min(x1, full_w - 1))
        y1 = max(0, min(y1, full_h - 1))
        x2 = max(x1 + 1, min(x2, full_w))
        y2 = max(y1 + 1, min(y2, full_h))
        image_bgr = image_bgr[y1:y2, x1:x2]
        x_offset = x1
        y_offset = y1

    infer_h, infer_w = image_bgr.shape[:2]

    # --- Run FastSAM inference (CPU only) ---
    try:
        model = FastSAM(model_path)
        results = model(
            image_bgr,
            device="cpu",
            retina_masks=True,
            imgsz=1024,
            conf=0.4,
            iou=0.9,
        )
    except Exception as exc:
        output_error(f"inference_error: {exc}")
        sys.exit(0)

    # --- Extract masks ---
    try:
        masks = results[0].masks
        if masks is None or len(masks) == 0:
            print(
                json.dumps(
                    {
                        "contours": [],
                        "image_size": {"width": full_w, "height": full_h},
                    }
                )
            )
            sys.exit(0)

        # Confidence scores (boxes.conf) aligned with masks
        confs = results[0].boxes.conf.cpu().numpy() if results[0].boxes is not None else None
        mask_data = masks.data.cpu().numpy()  # shape: (N, H, W), float32 0..1
    except Exception as exc:
        output_error(f"mask_extract_error: {exc}")
        sys.exit(0)

    # --- Select largest segment by mask area ---
    try:
        import numpy as np

        areas = [float(mask_data[i].sum()) for i in range(len(mask_data))]
        best_idx = int(np.argmax(areas))
        best_mask = (mask_data[best_idx] > 0.5).astype(np.uint8) * 255
        best_conf = float(confs[best_idx]) if confs is not None and best_idx < len(confs) else 0.0
        best_area = areas[best_idx]
    except Exception as exc:
        output_error(f"mask_select_error: {exc}")
        sys.exit(0)

    # --- Resize mask to inference image size if needed ---
    try:
        if best_mask.shape[:2] != (infer_h, infer_w):
            best_mask = cv2.resize(best_mask, (infer_w, infer_h), interpolation=cv2.INTER_NEAREST)
    except Exception as exc:
        output_error(f"mask_resize_error: {exc}")
        sys.exit(0)

    # --- Extract contour polygon with OpenCV ---
    try:
        contours_raw, _ = cv2.findContours(
            best_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE
        )
        if not contours_raw:
            print(
                json.dumps(
                    {
                        "contours": [],
                        "image_size": {"width": full_w, "height": full_h},
                    }
                )
            )
            sys.exit(0)

        # Take the largest contour by area in case of fragments
        largest_contour = max(contours_raw, key=cv2.contourArea)
    except Exception as exc:
        output_error(f"contour_extract_error: {exc}")
        sys.exit(0)

    # --- Simplify polygon ---
    try:
        perimeter = cv2.arcLength(largest_contour, closed=True)
        epsilon = 0.005 * perimeter
        simplified = cv2.approxPolyDP(largest_contour, epsilon, closed=True)
        # simplified shape: (N, 1, 2) → list of [x, y] with ROI offset applied
        points = [
            [int(pt[0][0]) + x_offset, int(pt[0][1]) + y_offset]
            for pt in simplified
        ]
    except Exception as exc:
        output_error(f"poly_simplify_error: {exc}")
        sys.exit(0)

    # --- Build output ---
    output = {
        "contours": [
            {
                "contour_px": points,
                "confidence": round(best_conf, 4),
                "area_px": round(best_area, 1),
            }
        ],
        "image_size": {"width": full_w, "height": full_h},
    }
    print(json.dumps(output))
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc), "contours": []}))
        sys.exit(0)
