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
    # Check next to this script file (works when spawned from any working directory)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    for candidate in [
        os.path.join(script_dir, "FastSAM-s.pt"),
        os.path.join(os.getcwd(), "FastSAM-s.pt"),
    ]:
        if os.path.isfile(candidate):
            return candidate
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

    # --- Select best segment (largest that isn't background) ---
    try:
        import numpy as np

        total_pixels = float(infer_h * infer_w)

        # Collect all significant masks (0.5%–85% of image)
        significant = []
        for i in range(len(mask_data)):
            area_ratio = float(mask_data[i].sum()) / total_pixels
            if 0.005 <= area_ratio <= 0.85:
                conf = float(confs[i]) if confs is not None and i < len(confs) else 0.5
                significant.append((i, area_ratio, conf))

        if not significant:
            print(json.dumps({"contours": [], "image_size": {"width": full_w, "height": full_h}}))
            sys.exit(0)

        # Check if largest mask covers > 40% — if so, it's clearly the main object
        significant.sort(key=lambda x: x[1], reverse=True)
        largest_ratio = significant[0][1]

        if roi is not None:
            # With ROI: object is spatially confined — use convex hull of all segments
            # to get the complete object outline even when it's fragmented (e.g. keyboard)
            all_pts = []
            for i, ratio, _ in significant:
                m = (mask_data[i] > 0.5).astype(np.uint8)
                if m.shape[:2] != (infer_h, infer_w):
                    m = cv2.resize(m, (infer_w, infer_h), interpolation=cv2.INTER_NEAREST)
                ctrs, _ = cv2.findContours(m * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                for c in ctrs:
                    all_pts.append(c)

            if not all_pts:
                print(json.dumps({"contours": [], "image_size": {"width": full_w, "height": full_h}}))
                sys.exit(0)

            all_pts_np = np.vstack(all_pts)
            hull = cv2.convexHull(all_pts_np)
            # Build output directly from hull — add ROI offset and scale
            hull_points = [
                [int(p[0][0]) + x_offset, int(p[0][1]) + y_offset]
                for p in hull
            ]
            output = {
                "contours": [
                    {
                        "contour_px": hull_points,
                        "confidence": float(np.mean([c for _, _, c in significant])),
                        "area_px": float(cv2.contourArea(hull)),
                    }
                ],
                "image_size": {"width": full_w, "height": full_h},
            }
            print(json.dumps(output))
            sys.exit(0)
        else:
            # Without ROI: pick the single largest significant mask
            best_idx = significant[0][0]
            best_conf = significant[0][2]
            best_mask = (mask_data[best_idx] > 0.5).astype(np.uint8) * 255
            best_area = float(mask_data[best_idx].sum())
    except Exception as exc:
        output_error(f"mask_select_error: {exc}")
        sys.exit(0)

    # --- Resize mask to inference image size if needed (single-mask path only) ---
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
        epsilon = 0.002 * perimeter
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
