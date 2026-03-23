"""
Phase 2 Web Calibration for Photo Measure.

Searches the web for reference images of a hardware model, extracts contours
from those images, and outputs a consensus contour via ICP alignment.

Usage:
    python web_calibrate.py --model-id <model_id> --gemini-key <api_key>

Output (JSON lines to stdout):
    {"event": "progress", "message": "..."}
    {"event": "contour-update", "source": "web-calibrated", "contours": [...]}
    {"event": "skip", "reason": "..."}
"""

import sys
import json
import argparse
import os
import tempfile
import urllib.parse

# ---------------------------------------------------------------------------
# Optional-dependency guard — emit skip and exit if critical libs missing
# ---------------------------------------------------------------------------
_missing = []
try:
    import requests
except ImportError:
    _missing.append("requests")

try:
    from bs4 import BeautifulSoup
except ImportError:
    _missing.append("bs4")

try:
    from scipy.spatial import KDTree
    import scipy.optimize as scipy_optimize
except ImportError:
    _missing.append("scipy")

if _missing:
    print(json.dumps({"event": "skip", "reason": f"missing optional dependencies: {', '.join(_missing)}"}))
    sys.exit(0)

import numpy as np
import cv2


# ---------------------------------------------------------------------------
# Gemini helpers
# ---------------------------------------------------------------------------

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_MODEL = "gemini-2.5-flash"


def _emit(obj: dict) -> None:
    """Write a JSON-line event to stdout and flush immediately."""
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def search_web_for_model(model_id: str, gemini_key: str) -> list[str]:
    """
    Call Gemini with google_search grounding to get URLs related to the model.
    Returns a list of source URLs extracted from groundingChunks metadata.
    """
    url = f"{GEMINI_API_BASE}/models/{GEMINI_MODEL}:generateContent?key={gemini_key}"

    query = f"{model_id} specification image teardown photo"

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": f"Search for: {query}. List the most relevant web sources."}
                ]
            }
        ],
        "tools": [{"google_search": {}}],
        "generationConfig": {
            "temperature": 0,
        },
    }

    resp = requests.post(url, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    urls: list[str] = []

    # Extract URLs from groundingMetadata -> groundingChunks
    candidates = data.get("candidates", [])
    for candidate in candidates:
        grounding_metadata = candidate.get("groundingMetadata", {})
        grounding_chunks = grounding_metadata.get("groundingChunks", [])
        for chunk in grounding_chunks:
            web = chunk.get("web", {})
            uri = web.get("uri", "")
            if uri and uri not in urls:
                urls.append(uri)

        # Also check groundingSupports -> chunkIndices cross-referenced URIs
        # (already covered via groundingChunks above)

        # Some API versions surface a different key: searchEntryPoint
        # Nothing further needed here.

    return urls


# ---------------------------------------------------------------------------
# Image scraping helpers
# ---------------------------------------------------------------------------

_REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )
}


def _is_absolute_url(url: str) -> bool:
    return url.startswith("http://") or url.startswith("https://")


def _resolve_url(src: str, base_url: str) -> str | None:
    """Resolve a possibly-relative src against a base URL."""
    if not src or src.startswith("data:"):
        return None
    if _is_absolute_url(src):
        return src
    try:
        return urllib.parse.urljoin(base_url, src)
    except Exception:
        return None


def _image_dimensions_from_response(resp: requests.Response) -> tuple[int, int] | None:
    """Decode the raw bytes in resp and return (width, height), or None on failure."""
    try:
        arr = np.frombuffer(resp.content, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
        if img is None:
            return None
        h, w = img.shape[:2]
        return w, h
    except Exception:
        return None


def fetch_images_from_url(page_url: str, max_images: int = 3) -> list[tuple[str, bytes]]:
    """
    Fetch a web page, find <img> tags, filter out small images (< 200 px),
    and return up to *max_images* (url, raw_bytes) pairs.
    """
    try:
        resp = requests.get(page_url, headers=_REQUEST_HEADERS, timeout=15)
        resp.raise_for_status()
    except Exception:
        return []

    try:
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception:
        return []

    results: list[tuple[str, bytes]] = []

    for img_tag in soup.find_all("img"):
        if len(results) >= max_images:
            break

        src = img_tag.get("src", "") or img_tag.get("data-src", "") or img_tag.get("data-lazy-src", "")
        img_url = _resolve_url(src, page_url)
        if not img_url:
            continue

        # Fast path: check width/height HTML attributes
        width_attr = img_tag.get("width")
        height_attr = img_tag.get("height")
        if width_attr and height_attr:
            try:
                w = int(str(width_attr).replace("px", "").strip())
                h = int(str(height_attr).replace("px", "").strip())
                if w < 200 or h < 200:
                    continue
            except (ValueError, TypeError):
                pass  # Fall through to download-and-check

        # Download the image
        try:
            img_resp = requests.get(img_url, headers=_REQUEST_HEADERS, timeout=10)
            img_resp.raise_for_status()
        except Exception:
            continue

        # If no HTML dimensions, check actual decoded size
        if not (width_attr and height_attr):
            dims = _image_dimensions_from_response(img_resp)
            if dims is None:
                continue
            w, h = dims
            if w < 200 or h < 200:
                continue

        results.append((img_url, img_resp.content))

    return results


# ---------------------------------------------------------------------------
# Edge / contour extraction  (reuses logic from edge_detect.py)
# ---------------------------------------------------------------------------

def detect_edges_from_bytes(image_bytes: bytes) -> list[list[list[int]]]:
    """
    Run Canny edge detection on raw image bytes.
    Returns a list of contour point-lists: [[[x, y], ...], ...].
    Only contours whose area >= 0.01% of the image are kept.
    """
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return []

    h, w = img.shape[:2]

    # Resize so longest edge <= 1024 px for consistent processing
    max_size = 1024
    longest = max(w, h)
    scale = 1.0
    if longest > max_size:
        scale = longest / max_size
        new_w = int(round(w / scale))
        new_h = int(round(h / scale))
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # CLAHE contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # Gaussian blur
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Canny edge detection
    edges = cv2.Canny(blurred, 30, 100)

    # Dilate to close small gaps
    kernel = np.ones((5, 5), np.uint8)
    edges = cv2.dilate(edges, kernel, iterations=1)

    contours_raw, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_area = img.shape[0] * img.shape[1] * 0.0001

    result: list[list[list[int]]] = []
    for contour in contours_raw:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue

        # Simplify
        peri = cv2.arcLength(contour, True)
        epsilon = 0.005 * peri
        approx = cv2.approxPolyDP(contour, epsilon, True)

        points = [
            [int(round(pt[0][0] * scale)), int(round(pt[0][1] * scale))]
            for pt in approx
        ]
        result.append(points)

    # Sort by area descending; return only the largest contour per image
    # (most likely the device outline)
    result.sort(
        key=lambda pts: cv2.contourArea(np.array(pts, dtype=np.int32)),
        reverse=True,
    )

    return result


# ---------------------------------------------------------------------------
# ICP alignment helpers
# ---------------------------------------------------------------------------

def _points_to_array(points: list[list[int]]) -> np.ndarray:
    return np.array(points, dtype=np.float64)


def _icp_step(
    source: np.ndarray,
    target_tree: KDTree,
    target: np.ndarray,
) -> tuple[np.ndarray, float, float]:
    """
    One ICP iteration: find nearest neighbours in target for source points,
    compute a rigid (rotation + translation) transform, and return:
      - transformed source points
      - inlier ratio (fraction of source pts within 5 px of their nn)
      - mean distance
    """
    dists, indices = target_tree.query(source)

    inlier_mask = dists < 5.0
    inlier_ratio = float(np.mean(inlier_mask))

    matched_target = target[indices]

    # Compute optimal rigid transform (Umeyama / SVD method)
    src_mean = source.mean(axis=0)
    tgt_mean = matched_target.mean(axis=0)

    src_c = source - src_mean
    tgt_c = matched_target - tgt_mean

    H = src_c.T @ tgt_c
    U, S, Vt = np.linalg.svd(H)
    R = (Vt.T @ U.T)

    # Handle reflection
    if np.linalg.det(R) < 0:
        Vt[-1, :] *= -1
        R = Vt.T @ U.T

    t = tgt_mean - R @ src_mean
    transformed = (R @ source.T).T + t

    return transformed, inlier_ratio, float(np.mean(dists))


def icp_align(
    source_pts: list[list[int]],
    target_pts: list[list[int]],
    max_iterations: int = 50,
    inlier_threshold: float = 5.0,
) -> tuple[np.ndarray, float]:
    """
    Align source contour to target contour using ICP.
    Returns (transformed_source_points, final_inlier_ratio).
    """
    source = _points_to_array(source_pts)
    target = _points_to_array(target_pts)

    if len(source) < 3 or len(target) < 3:
        return source, 0.0

    target_tree = KDTree(target)
    current = source.copy()
    best_inlier_ratio = 0.0

    for _ in range(max_iterations):
        current, inlier_ratio, mean_dist = _icp_step(current, target_tree, target)
        if inlier_ratio > best_inlier_ratio:
            best_inlier_ratio = inlier_ratio
        if mean_dist < 0.1:
            break

    return current, best_inlier_ratio


def compute_consensus_contour(
    all_contours: list[list[list[int]]],
    inlier_threshold: float = 0.6,
    min_agreeing: int = 2,
) -> list[list[int]] | None:
    """
    Align all contours against the first one as reference.
    If at least *min_agreeing* contours achieve inlier_ratio >= *inlier_threshold*,
    return the reference contour as the consensus.  Otherwise return None.
    """
    if len(all_contours) < min_agreeing:
        return None

    reference = all_contours[0]
    agreeing = 0

    for contour in all_contours[1:]:
        _aligned, inlier_ratio = icp_align(contour, reference)
        if inlier_ratio >= inlier_threshold:
            agreeing += 1

    if agreeing >= min_agreeing - 1:  # -1 because reference is not aligned to itself
        return reference

    return None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Phase 2 web calibration")
    parser.add_argument("--model-id", required=True, help="Hardware model ID (e.g. L17C3P53)")
    parser.add_argument("--gemini-key", required=True, help="Gemini API key")
    args = parser.parse_args()

    model_id: str = args.model_id
    gemini_key: str = args.gemini_key

    try:
        # ------------------------------------------------------------------
        # Step 1: Search the web via Gemini grounding
        # ------------------------------------------------------------------
        _emit({"event": "progress", "message": f"Searching for {model_id}..."})

        urls = search_web_for_model(model_id, gemini_key)

        if not urls:
            _emit({"event": "skip", "reason": "no_urls_found"})
            return

        _emit({"event": "progress", "message": f"Found {len(urls)} URLs, fetching images..."})

        # ------------------------------------------------------------------
        # Step 2: Scrape images from up to 5 URLs, collect up to 3 images
        # ------------------------------------------------------------------
        image_blobs: list[tuple[str, bytes]] = []
        for page_url in urls[:5]:
            if len(image_blobs) >= 3:
                break
            _emit({"event": "progress", "message": f"Fetching page: {page_url}"})
            page_images = fetch_images_from_url(page_url, max_images=3 - len(image_blobs))
            image_blobs.extend(page_images)

        if not image_blobs:
            _emit({"event": "skip", "reason": "no_images_found"})
            return

        _emit({"event": "progress", "message": f"Downloaded {len(image_blobs)} images, running edge detection..."})

        # ------------------------------------------------------------------
        # Step 3: Canny edge detection on each image
        # ------------------------------------------------------------------
        all_contours: list[list[list[int]]] = []
        for img_url, img_bytes in image_blobs:
            contours = detect_edges_from_bytes(img_bytes)
            if contours:
                # Take the largest (most likely device outline)
                all_contours.append(contours[0])
                _emit({"event": "progress", "message": f"Extracted contour from {img_url} ({len(contours[0])} points)"})

        if not all_contours:
            _emit({"event": "skip", "reason": "no_contours_extracted"})
            return

        # ------------------------------------------------------------------
        # Step 4: ICP alignment and consensus check
        # ------------------------------------------------------------------
        _emit({"event": "progress", "message": f"Running ICP alignment on {len(all_contours)} contours..."})

        consensus = compute_consensus_contour(all_contours, inlier_threshold=0.6, min_agreeing=2)

        if consensus is None:
            _emit({"event": "skip", "reason": "icp_consensus_failed"})
            return

        # ------------------------------------------------------------------
        # Step 5: Emit result
        # ------------------------------------------------------------------
        _emit({
            "event": "contour-update",
            "source": "web-calibrated",
            "contours": [
                {"contour_px": consensus}
            ],
        })

    except KeyboardInterrupt:
        _emit({"event": "skip", "reason": "interrupted"})
    except Exception as exc:
        _emit({"event": "skip", "reason": str(exc)})


if __name__ == "__main__":
    main()
