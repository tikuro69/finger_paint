const canvas = document.querySelector("#paintCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const colorInput = document.querySelector("#paintColor");
const brushInput = document.querySelector("#brushSize");
const smearInput = document.querySelector("#smearStrength");
const brushSizeValue = document.querySelector("#brushSizeValue");
const smearValue = document.querySelector("#smearValue");
const clearButton = document.querySelector("#clearButton");
const saveButton = document.querySelector("#saveButton");

const paperColor = "#fbf6ea";
let isPainting = false;
let pointerId = null;
let lastPoint = null;
let lastDabTime = 0;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const snapshot = document.createElement("canvas");
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  snapshot.getContext("2d").drawImage(canvas, 0, 0);

  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  fillPaper();
  if (snapshot.width && snapshot.height) {
    ctx.drawImage(snapshot, 0, 0, rect.width, rect.height);
  }
}

function fillPaper() {
  const rect = canvas.getBoundingClientRect();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = paperColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // ほんの少し紙の粒を入れて、真っ白なデジタル面に見えにくくする。
  ctx.save();
  ctx.globalAlpha = 0.055;
  for (let i = 0; i < rect.width * rect.height * 0.00055; i += 1) {
    const x = Math.random() * rect.width;
    const y = Math.random() * rect.height;
    const shade = Math.random() > 0.5 ? "#ffffff" : "#cdbf9e";
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, Math.random() * 1.4 + 0.5, Math.random() * 1.4 + 0.5);
  }
  ctx.restore();
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToCss({ r, g, b }, alpha = 1) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mixColors(a, b, amount) {
  return {
    r: a.r * (1 - amount) + b.r * amount,
    g: a.g * (1 - amount) + b.g * amount,
    b: a.b * (1 - amount) + b.b * amount,
  };
}

function sampleAverageColor(x, y, radius) {
  const scale = window.devicePixelRatio || 1;
  const sx = clamp(Math.floor((x - radius) * scale), 0, canvas.width - 1);
  const sy = clamp(Math.floor((y - radius) * scale), 0, canvas.height - 1);
  const sw = clamp(Math.floor(radius * 2 * scale), 1, canvas.width - sx);
  const sh = clamp(Math.floor(radius * 2 * scale), 1, canvas.height - sy);
  const pixels = ctx.getImageData(sx, sy, sw, sh).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;

  for (let yy = 0; yy < sh; yy += 3) {
    for (let xx = 0; xx < sw; xx += 3) {
      const dx = xx / scale - radius;
      const dy = yy / scale - radius;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;

      const index = (yy * sw + xx) * 4;
      const influence = 1 - distance / radius;
      r += pixels[index] * influence;
      g += pixels[index + 1] * influence;
      b += pixels[index + 2] * influence;
      weight += influence;
    }
  }

  if (!weight) return hexToRgb(colorInput.value);
  return { r: r / weight, g: g / weight, b: b / weight };
}

function paintBlob(point) {
  const radius = Number(brushInput.value);
  const base = hexToRgb(colorInput.value);
  const drops = Math.ceil(radius * 0.45);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  for (let i = 0; i < drops; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const spread = Math.sqrt(Math.random()) * radius * 0.48;
    const x = point.x + Math.cos(angle) * spread;
    const y = point.y + Math.sin(angle) * spread;
    const w = radius * (0.28 + Math.random() * 0.48);
    const h = radius * (0.18 + Math.random() * 0.34);
    const color = mixColors(base, sampleAverageColor(x, y, radius * 0.25), Math.random() * 0.2);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = rgbToCss(color, 0.33 + Math.random() * 0.28);
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function smearStroke(from, to) {
  const radius = Number(brushInput.value);
  const strength = Number(smearInput.value) / 100;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.5) return;

  const ux = dx / distance;
  const uy = dy / distance;
  const normalX = -uy;
  const normalY = ux;
  const steps = Math.max(1, Math.ceil(distance / Math.max(3, radius * 0.18)));

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";

  for (let step = 0; step < steps; step += 1) {
    const t = step / steps;
    const cx = from.x + dx * t;
    const cy = from.y + dy * t;
    const picked = sampleAverageColor(cx - ux * radius * 0.4, cy - uy * radius * 0.4, radius * 0.52);
    const selected = hexToRgb(colorInput.value);
    const paint = mixColors(picked, selected, 0.08 + strength * 0.16);
    const strandCount = Math.ceil(7 + radius * 0.13);

    for (let i = 0; i < strandCount; i += 1) {
      const lane = (Math.random() - 0.5) * radius * 1.15;
      const wobble = (Math.random() - 0.5) * radius * 0.18;
      const startX = cx + normalX * lane - ux * radius * (0.08 + Math.random() * 0.18);
      const startY = cy + normalY * lane - uy * radius * (0.08 + Math.random() * 0.18);
      const length = radius * (0.22 + strength * 0.68) * (0.65 + Math.random() * 0.75);
      const endX = startX + ux * length + normalX * wobble;
      const endY = startY + uy * length + normalY * wobble;
      const width = Math.max(1.2, radius * (0.025 + Math.random() * 0.05));
      const alpha = 0.055 + strength * 0.18 + Math.random() * 0.06;

      ctx.strokeStyle = rgbToCss(paint, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(
        (startX + endX) / 2 + normalX * wobble * 0.45,
        (startY + endY) / 2 + normalY * wobble * 0.45,
        endX,
        endY,
      );
      ctx.stroke();
    }

    // 指で押しのばした絵の具の厚みを、方向付きの半透明楕円で足す。
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = rgbToCss(paint, 0.035 + strength * 0.08);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.52, radius * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function handlePointerDown(event) {
  event.preventDefault();
  pointerId = event.pointerId;
  canvas.setPointerCapture(pointerId);
  isPainting = true;
  lastPoint = getCanvasPoint(event);
  lastDabTime = performance.now();
  paintBlob(lastPoint);
}

function handlePointerMove(event) {
  if (!isPainting || event.pointerId !== pointerId || !lastPoint) return;
  event.preventDefault();
  const point = getCanvasPoint(event);
  smearStroke(lastPoint, point);
  lastPoint = point;

  // ゆっくり動かした時は、絵の具のかたまり感も少し残す。
  if (performance.now() - lastDabTime > 90) {
    paintBlob(point);
    lastDabTime = performance.now();
  }
}

function handlePointerUp(event) {
  if (event.pointerId !== pointerId) return;
  isPainting = false;
  lastPoint = null;
  pointerId = null;
}

function clearCanvas() {
  fillPaper();
}

function savePng() {
  const link = document.createElement("a");
  link.download = "finger-paint.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function syncLabels() {
  brushSizeValue.textContent = brushInput.value;
  smearValue.textContent = smearInput.value;
}

brushInput.addEventListener("input", syncLabels);
smearInput.addEventListener("input", syncLabels);
clearButton.addEventListener("click", clearCanvas);
saveButton.addEventListener("click", savePng);
canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerUp);
window.addEventListener("resize", resizeCanvas);

syncLabels();
requestAnimationFrame(resizeCanvas);
