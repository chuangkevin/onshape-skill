#!/usr/bin/env python3
"""
Phase 1 segmentation using FastSAM.

Usage:
    python fastsam_segment.py --image <path> [--roi <x1,y1,x2,y2>] [--model <path>]

Output (stdout): JSON with contours, image_size.
On error: JSON with error message and empty contours.

Model resolution order:
  1. --model argument (if file exists)
  2. FastSAM-s.pt next to this script
  3. FastSAM-s.pt in cwd
  4. Auto-download via ultralytics (saved next to this script for reuse)
  If download fails, outputs {"error": "fastsam_unavailable"}.
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
    """Return a valid model path, or None if the model cannot be found or downloaded.

    Resolution order:
    1. model_arg (if file exists)
    2. FastSAM-s.pt next to this script
    3. FastSAM-s.pt in cwd
    4. Auto-download via ultralytics into the script directory
       (download is skipped and None returned on any failure)
    """
    # 1. Explicit path
    if os.path.isfile(model_arg):
        return model_arg

    script_dir = os.path.dirname(os.path.abspath(__file__))

    # 2. Next to this script
    local_path = os.path.join(script_dir, "FastSAM-s.pt")
    if os.path.isfile(local_path):
        return local_path

    # 3. Current working directory
    cwd_path = os.path.join(os.getcwd(), "FastSAM-s.pt")
    if os.path.isfile(cwd_path):
        return cwd_path

    # 4. Auto-download (requires ultralytics to already be importable)
    try:
        from ultralytics.utils.downloads import attempt_download_asset  # type: ignore
        downloaded = attempt_download_asset("FastSAM-s.pt")
        if downloaded and os.path.isfile(str(downloaded)):
            return str(downloaded)
    except Exception:
        pass

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


MIN_CONTOUR_POINTS = 6


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

    # --- Resolve model path (auto-download if needed) ---
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
    image_size = {"width": full_w, "height": full_h}

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
            verbose=False,
        )
    except Exception as exc:
        output_error(f"inference_error: {exc}")
        sys.exit(0)

    # --- Extract masks ---
    try:
        masks = results[0].masks
        if masks is None or len(masks) == 0:
            print(json.dumps({"contours": [], "image_size": image_size}))
            sys.exit(0)

        # Confidence scores (boxes.conf) aligned with masks
        confs = results[0].boxes.conf.cpu().numpy() if results[0].boxes is not None else None
        mask_data = masks.data.cpu().numpy()  # shape: (N, H, W), float32 0..1
    except Exception as exc:
        output_error(f"mask_extract_error: {exc}")
        sys.exit(0)

    # --- Select best segment (largest that isn't background) ---
    try:
        total_pixels = float(infer_h * infer_w)

        # ROI path: lower threshold to catch individual small parts (e.g. keyboard keys)
        # Non-ROI path: higher threshold to avoid noise
        min_ratio = 0.0005 if roi is not None else 0.005  # 0.05% vs 0.5%

        significant = []
        for i in range(len(mask_data)):
            area_ratio = float(mask_data[i].sum()) / total_pixels
            if min_ratio <= area_ratio <= 0.85:
                conf = float(confs[i]) if confs is not None and i < len(confs) else 0.5
                significant.append((i, area_ratio, conf))

        if not significant:
            print(json.dumps({"contours": [], "image_size": image_size}))
            sys.exit(0)

        significant.sort(key=lambda x: x[1], reverse=True)

        if roi is not None:
            # --- ROI path: fixed threshold + morphological closing ---
            # Threshold at 90: separates dark objects (keyboard, battery) from
            # light backgrounds (wood table, paper). 20px closing bridges
            # inter-key gaps while preserving concave features like bottom
            # connector brackets or side notches.

            gray_image = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

            _, thresh = cv2.threshold(gray_image, 90, 255, cv2.THRESH_BINARY_INV)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 20))
            closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

            ctrs_thresh, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            thresh_best = None
            if ctrs_thresh:
                largest_thresh = max(ctrs_thresh, key=cv2.contourArea)
                thresh_ratio = cv2.contourArea(largest_thresh) / float(infer_h * infer_w)
                if 0.20 <= thresh_ratio <= 0.90:
                    thresh_best = largest_thresh

            if thresh_best is not None:
                best_ctr = thresh_best
                avg_conf = 0.75
            else:
                # --- Fallback: FastSAM mask union (for objects not clearly darker than bg) ---
                DARK_THRESHOLD = 130
                combined = np.zeros((infer_h, infer_w), dtype=np.uint8)
                total_conf = 0.0
                included = 0
                for i, ratio, conf in significant:
                    m = (mask_data[i] > 0.5).astype(np.uint8)
                    if m.shape[:2] != (infer_h, infer_w):
                        m = cv2.resize(m, (infer_w, infer_h), interpolation=cv2.INTER_NEAREST)
                    mean_val = cv2.mean(gray_image, mask=m * 255)[0]
                    if mean_val < DARK_THRESHOLD:
                        combined = cv2.bitwise_or(combined, m * 255)
                        total_conf += conf
                        included += 1

                coverage = np.count_nonzero(combined) / float(infer_h * infer_w)
                if included == 0 or coverage < 0.15:
                    combined = np.zeros((infer_h, infer_w), dtype=np.uint8)
                    total_conf = 0.0
                    for i, ratio, conf in significant:
                        m = (mask_data[i] > 0.5).astype(np.uint8)
                        if m.shape[:2] != (infer_h, infer_w):
                            m = cv2.resize(m, (infer_w, infer_h), interpolation=cv2.INTER_NEAREST)
                        combined = cv2.bitwise_or(combined, m * 255)
                        total_conf += conf

                kernel_fb = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 20))
                closed_fb = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel_fb)
                ctrs_fb, _ = cv2.findContours(closed_fb, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if not ctrs_fb:
                    print(json.dumps({"contours": [], "image_size": image_size}))
                    sys.exit(0)
                if len(ctrs_fb) > 1:
                    all_pts = np.concatenate(ctrs_fb, axis=0)
                    best_ctr = cv2.convexHull(all_pts)
                else:
                    best_ctr = ctrs_fb[0]
                avg_conf = total_conf / len(significant) if significant else 0.5

            # best_ctr is already set above (threshold or FastSAM fallback path)
            peri = cv2.arcLength(best_ctr, closed=True)
            eps = 0.003 * peri  # 0.3%: preserves concave features like bottom brackets
            simplified = cv2.approxPolyDP(best_ctr, eps, closed=True)
            hull_points = [
                [int(p[0][0]) + x_offset, int(p[0][1]) + y_offset]
                for p in simplified
            ]

            # Quality gate: 4+ points required
            if len(hull_points) < 4:
                print(json.dumps({"contours": [], "image_size": image_size}))
                sys.exit(0)
            output = {
                "contours": [
                    {
                        "contour_px": hull_points,
                        "confidence": round(avg_conf, 4),
                        "area_px": float(cv2.contourArea(best_ctr)),
                    }
                ],
                "image_size": image_size,
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
            print(json.dumps({"contours": [], "image_size": image_size}))
            sys.exit(0)

        largest_contour = max(contours_raw, key=cv2.contourArea)
    except Exception as exc:
        output_error(f"contour_extract_error: {exc}")
        sys.exit(0)

    # --- Simplify polygon ---
    try:
        perimeter = cv2.arcLength(largest_contour, closed=True)
        epsilon = 0.002 * perimeter
        simplified = cv2.approxPolyDP(largest_contour, epsilon, closed=True)
        points = [
            [int(pt[0][0]) + x_offset, int(pt[0][1]) + y_offset]
            for pt in simplified
        ]
    except Exception as exc:
        output_error(f"poly_simplify_error: {exc}")
        sys.exit(0)

    # --- Quality gate: reject if too few points ---
    if len(points) < MIN_CONTOUR_POINTS:
        print(json.dumps({"contours": [], "image_size": image_size}))
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
        "image_size": image_size,
    }
    print(json.dumps(output))
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc), "contours": []}))
        sys.exit(0)
