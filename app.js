const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const resultCanvas = document.getElementById('resultCanvas');
const editOverlay = document.getElementById('editOverlay');
const statusEl = document.getElementById('status');
const startCameraBtn = document.getElementById('startCamera');
const captureBtn = document.getElementById('captureBtn');
const downloadBtn = document.getElementById('downloadBtn');
const enhancementSelect = document.getElementById('enhancement');

const overlayCtx = overlay.getContext('2d');
const resultCtx = resultCanvas.getContext('2d');
const editCtx = editOverlay.getContext('2d');

let stream;
let rafId;
let cvReady = false;
let smoothedCorners = null;
let stabilityCounter = 0;
let lastCaptureTs = 0;
let capturedSource = null;
let manualCorners = null;
let draggingCorner = -1;

const cornerHistory = [];
const STABLE_FRAME_TARGET = 12;
const AUTO_CAPTURE_DELAY_MS = 2500;

window.addEventListener('opencv-ready', () => {
  cvReady = true;
  statusEl.textContent = 'OpenCV ready. Start camera to begin scanning.';
});

startCameraBtn.addEventListener('click', async () => {
  if (!cvReady) {
    statusEl.textContent = 'OpenCV is still loading...';
    return;
  }

  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  resizeCanvases();
  captureBtn.disabled = false;
  statusEl.textContent = 'Looking for document edges...';
  processFrame();
});

captureBtn.addEventListener('click', () => {
  if (smoothedCorners) {
    captureDocument(smoothedCorners);
  }
});

downloadBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'scan.jpg';
  link.href = resultCanvas.toDataURL('image/jpeg', 0.92);
  link.click();
});

enhancementSelect.addEventListener('change', () => {
  if (capturedSource && manualCorners) {
    const warped = warpFromCorners(capturedSource, manualCorners, 1000, 1400);
    applyEnhancementToCanvas(warped, resultCanvas, enhancementSelect.value);
    warped.delete();
  }
});

window.addEventListener('resize', resizeCanvases);

editOverlay.addEventListener('pointerdown', (event) => {
  if (!manualCorners) return;
  const p = getOverlayPoint(event);
  let minDist = Infinity;
  draggingCorner = -1;

  manualCorners.forEach((corner, idx) => {
    const d = Math.hypot(corner.x - p.x, corner.y - p.y);
    if (d < minDist && d < 40) {
      minDist = d;
      draggingCorner = idx;
    }
  });

  if (draggingCorner !== -1) {
    editOverlay.setPointerCapture(event.pointerId);
  }
});

editOverlay.addEventListener('pointermove', (event) => {
  if (draggingCorner === -1 || !manualCorners) return;
  const p = getOverlayPoint(event);
  manualCorners[draggingCorner] = {
    x: clamp(p.x, 0, editOverlay.width),
    y: clamp(p.y, 0, editOverlay.height),
  };
  drawManualCorners();
  const warped = warpFromCorners(capturedSource, manualCorners, 1000, 1400);
  applyEnhancementToCanvas(warped, resultCanvas, enhancementSelect.value);
  warped.delete();
});

editOverlay.addEventListener('pointerup', () => {
  draggingCorner = -1;
});

function processFrame() {
  if (!cvReady || video.readyState < 2) {
    rafId = requestAnimationFrame(processFrame);
    return;
  }

  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;

  const src = cv.imread(video);
  const doc = detectDocument(src);

  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  if (doc) {
    cornerHistory.push(doc);
    if (cornerHistory.length > 5) cornerHistory.shift();
    smoothedCorners = averageCorners(cornerHistory);

    const movement = averageMovement(cornerHistory);
    if (movement < 10) {
      stabilityCounter += 1;
    } else {
      stabilityCounter = 0;
    }

    drawCorners(smoothedCorners, '#4DFF8A');
    statusEl.textContent = `Document detected (${Math.min(stabilityCounter, STABLE_FRAME_TARGET)}/${STABLE_FRAME_TARGET})`;

    if (
      stabilityCounter >= STABLE_FRAME_TARGET &&
      Date.now() - lastCaptureTs > AUTO_CAPTURE_DELAY_MS
    ) {
      captureDocument(smoothedCorners);
      lastCaptureTs = Date.now();
      stabilityCounter = 0;
    }
  } else {
    smoothedCorners = null;
    stabilityCounter = 0;
    statusEl.textContent = 'No document found. Aim camera at a page.';
  }

  src.delete();
  rafId = requestAnimationFrame(processFrame);
}

function detectDocument(src) {
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edged = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  cv.adaptiveThreshold(
    blur,
    gray,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY,
    11,
    2,
  );
  cv.Canny(gray, edged, 75, 200);
  cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  let best = null;
  let bestArea = 0;

  for (let i = 0; i < contours.size(); i += 1) {
    const contour = contours.get(i);
    const peri = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, 0.02 * peri, true);

    if (approx.rows === 4) {
      const area = Math.abs(cv.contourArea(approx));
      const imageArea = src.rows * src.cols;
      const areaRatio = area / imageArea;

      if (areaRatio > 0.12 && areaRatio < 0.95 && area > bestArea) {
        const corners = [];
        for (let j = 0; j < 4; j += 1) {
          corners.push({
            x: approx.intPtr(j, 0)[0],
            y: approx.intPtr(j, 0)[1],
          });
        }
        best = orderCorners(corners);
        bestArea = area;
      }
    }

    approx.delete();
    contour.delete();
  }

  gray.delete();
  blur.delete();
  edged.delete();
  contours.delete();
  hierarchy.delete();

  return best;
}

function captureDocument(corners) {
  if (!corners) return;

  const src = cv.imread(video);
  capturedSource?.delete();
  capturedSource = src.clone();

  const scaledCorners = corners.map((point) => ({
    x: (point.x / overlay.width) * capturedSource.cols,
    y: (point.y / overlay.height) * capturedSource.rows,
  }));

  const warped = warpFromCorners(capturedSource, scaledCorners, 1000, 1400);
  applyEnhancementToCanvas(warped, resultCanvas, enhancementSelect.value);
  warped.delete();

  mapCornersToEditor(scaledCorners);
  drawManualCorners();

  downloadBtn.disabled = false;
  statusEl.textContent = 'Captured. Drag corners if needed, then download.';

  src.delete();
}

function warpFromCorners(sourceMat, corners, width, height) {
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap((p) => [p.x, p.y]));
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
  const matrix = cv.getPerspectiveTransform(srcTri, dstTri);
  const dsize = new cv.Size(width, height);
  const dst = new cv.Mat();

  cv.warpPerspective(
    sourceMat,
    dst,
    matrix,
    dsize,
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar(),
  );

  srcTri.delete();
  dstTri.delete();
  matrix.delete();
  return dst;
}

function applyEnhancementToCanvas(srcMat, canvas, mode) {
  const dst = new cv.Mat();

  if (mode === 'document') {
    const gray = new cv.Mat();
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.equalizeHist(gray, gray);
    cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
    gray.delete();
  } else if (mode === 'bw') {
    const gray = new cv.Mat();
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.adaptiveThreshold(
      gray,
      gray,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      17,
      9,
    );
    cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
    gray.delete();
  } else {
    srcMat.copyTo(dst);
  }

  canvas.width = dst.cols;
  canvas.height = dst.rows;
  editOverlay.width = dst.cols;
  editOverlay.height = dst.rows;

  cv.imshow(canvas, dst);
  dst.delete();
}

function mapCornersToEditor(sourceCorners) {
  if (!capturedSource) return;
  manualCorners = sourceCorners.map((corner) => ({
    x: (corner.x / capturedSource.cols) * editOverlay.width,
    y: (corner.y / capturedSource.rows) * editOverlay.height,
  }));
}

function drawManualCorners() {
  if (!manualCorners) return;
  editCtx.clearRect(0, 0, editOverlay.width, editOverlay.height);

  editCtx.strokeStyle = '#8BD8FF';
  editCtx.fillStyle = '#8BD8FF';
  editCtx.lineWidth = 3;
  editCtx.beginPath();
  manualCorners.forEach((point, idx) => {
    if (idx === 0) editCtx.moveTo(point.x, point.y);
    else editCtx.lineTo(point.x, point.y);
  });
  editCtx.closePath();
  editCtx.stroke();

  manualCorners.forEach((point) => {
    editCtx.beginPath();
    editCtx.arc(point.x, point.y, 9, 0, Math.PI * 2);
    editCtx.fill();
  });
}

function drawCorners(corners, color) {
  overlayCtx.strokeStyle = color;
  overlayCtx.fillStyle = color;
  overlayCtx.lineWidth = 4;
  overlayCtx.beginPath();
  corners.forEach((point, idx) => {
    if (idx === 0) overlayCtx.moveTo(point.x, point.y);
    else overlayCtx.lineTo(point.x, point.y);
  });
  overlayCtx.closePath();
  overlayCtx.stroke();

  corners.forEach((point) => {
    overlayCtx.beginPath();
    overlayCtx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    overlayCtx.fill();
  });
}

function averageCorners(history) {
  const sums = [0, 0, 0, 0].map(() => ({ x: 0, y: 0 }));
  history.forEach((quad) => {
    quad.forEach((corner, idx) => {
      sums[idx].x += corner.x;
      sums[idx].y += corner.y;
    });
  });
  return sums.map((sum) => ({ x: sum.x / history.length, y: sum.y / history.length }));
}

function averageMovement(history) {
  if (history.length < 2) return Infinity;
  const current = history[history.length - 1];
  const prev = history[history.length - 2];
  let total = 0;
  for (let i = 0; i < 4; i += 1) {
    total += Math.hypot(current[i].x - prev[i].x, current[i].y - prev[i].y);
  }
  return total / 4;
}

function orderCorners(points) {
  const sumSorted = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const diffSorted = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));
  return [sumSorted[0], diffSorted[0], sumSorted[3], diffSorted[3]];
}

function resizeCanvases() {
  if (!video.videoWidth || !video.videoHeight) return;
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

function getOverlayPoint(event) {
  const rect = editOverlay.getBoundingClientRect();
  const scaleX = editOverlay.width / rect.width;
  const scaleY = editOverlay.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(rafId);
  stream?.getTracks().forEach((track) => track.stop());
  capturedSource?.delete();
});
