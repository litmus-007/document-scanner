# Mobile Document Scanner Specialist Brief

## Objective
Build a high-accuracy mobile web document scanning flow that:
- detects page borders automatically,
- corrects perspective distortion,
- crops pages cleanly,
- and returns scan-quality output suitable for document management workflows.

## Recommended Technical Approach

### 1) Real-time edge and contour detection
- Use OpenCV (WebAssembly via `opencv.js`) for mobile browser compatibility.
- Pre-process camera frames with:
  - grayscale conversion,
  - adaptive thresholding,
  - Gaussian blur,
  - Canny edge detection.
- Detect contours and rank 4-point polygons by area, rectangularity, and stability across frames.
- Add temporal smoothing (frame-to-frame confidence scoring) to reduce jitter.

### 2) Perspective correction and clean crop
- Order corner points consistently (top-left, top-right, bottom-right, bottom-left).
- Compute homography and apply perspective warp.
- Auto-trim noisy borders using post-warp margin analysis.
- Normalize output orientation and dimensions (e.g., A4/Letter ratio options).

### 3) Image enhancement pipeline
- Apply auto contrast + illumination normalization.
- Optional "Document" and "B&W" enhancement presets.
- Sharpen text regions while preserving edges.
- Export JPEG/PDF with configurable quality and compression.

### 4) Mobile UX considerations
- Provide live overlay showing detected page boundary.
- Trigger auto-capture when boundary confidence and motion stability are high.
- Include manual corner adjustment fallback for difficult backgrounds.
- Keep processing mostly on-device for responsiveness and privacy.

## Accuracy and Quality Strategy
- Validate with a dataset covering shadows, skew, wrinkled pages, low light, and complex backgrounds.
- Track KPIs:
  - boundary detection success rate,
  - corner localization error,
  - crop IoU (intersection over union),
  - OCR readability uplift after enhancement.
- Add device-specific tuning for common iOS and Android browsers.

## Delivery Plan
1. **Prototype (Week 1):** camera capture + contour detection + warp.
2. **Refinement (Week 2):** stability scoring, enhancement filters, manual fallback.
3. **Hardening (Week 3):** cross-device optimization, QA dataset benchmarking.
4. **Production handoff (Week 4):** integration docs, tuning knobs, monitoring recommendations.

## Candidate Profile You Should Prioritize
- Proven experience building mobile document scanner pipelines (OpenCV, CV, OCR-adjacent workflows).
- Strong understanding of camera constraints in mobile web browsers.
- Ability to optimize CV workloads for low-latency on mid-range devices.
- Demonstrated examples of perspective correction quality and edge-case handling.
