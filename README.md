# Document Scanner Prototype

A mobile-web document scanner prototype implementing the plan from `DOCUMENT_SCANNER_SPECIALIST_BRIEF.md`:

- automatic contour detection with OpenCV.js,
- temporal smoothing + auto-capture,
- perspective correction (homography warp),
- enhancement presets (`None`, `Document`, `B&W`),
- manual corner-adjust fallback.

## Run locally

```bash
python3 -m http.server 8080
```

Open http://localhost:8080 and allow camera access.

## Notes

- Works best on modern mobile browsers with `getUserMedia` support.
- OpenCV loads from the official CDN.
