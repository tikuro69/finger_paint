const canvas = document.querySelector("#paintCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const colorInput = document.querySelector("#paintColor");
const brushInput = document.querySelector("#brushSize");
const smearInput = document.querySelector("#smearStrength");
const touchTypeInput = document.querySelector("#touchType");
const brushSizeValue = document.querySelector("#brushSizeValue");
const smearValue = document.querySelector("#smearValue");
const clearButton = document.querySelector("#clearButton");
const saveButton = document.querySelector("#saveButton");

const paperColor = "#fbf6ea";
let isPainting = false;
let pointerId = null;
let lastPoint = null;
let lastDabTime = 0;
let smearOnly = false;

const touchProfiles = {
  finger: {
    mode: "finger",
    step: 0.26,
    pads: 5,
    lane: 0.56,
    wobble: 0.09,
    length: 1.05,
    alpha: 0.13,
  },
  bristle: {
    mode: "bristle",
    step: 0.13,
    strands: 18,
    strandScale: 0.19,
    lane: 1.25,
    wobble: 0.3,
    minLength: 0.08,
    length: 0.72,
    widthMin: 0.006,
    widthMax: 0.026,
    alpha: 0.12,
    skip: 0.04,
  },
};

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

function getTouchProfile() {
  return touchProfiles[touchTypeInput.value] || touchProfiles.finger;
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

function getSmearPaint(cx, cy, ux, uy, radius, strengthCurve, usesPickedColorOnly) {
  const picked = sampleAverageColor(cx - ux * radius * 0.45, cy - uy * radius * 0.45, radius * 0.58);
  const under = sampleAverageColor(cx, cy, radius * 0.42);
  const selected = hexToRgb(colorInput.value);

  if (usesPickedColorOnly) {
    return mixColors(picked, under, clamp(0.36 - strengthCurve * 0.24, 0.06, 0.36));
  }

  return mixColors(picked, selected, 0.04 + strengthCurve * 0.18);
}

function drawFingerSmear(cx, cy, ux, uy, normalX, normalY, radius, strengthCurve, paint, profile) {
  const angle = Math.atan2(uy, ux);
  const carry = radius * (0.2 + strengthCurve * profile.length);
  const alpha = 0.025 + strengthCurve * profile.alpha;

  // 指は細い毛筋ではなく、押しつぶした面が少しずつずれて色を運ぶ。
  for (let i = 0; i < profile.pads; i += 1) {
    const offset = (i / Math.max(1, profile.pads - 1) - 0.5) * radius * profile.lane;
    const slide = carry * (0.18 + i / profile.pads * 0.58);
    const wobble = (Math.random() - 0.5) * radius * profile.wobble;
    const x = cx + normalX * offset + ux * slide + normalX * wobble;
    const y = cy + normalY * offset + uy * slide + normalY * wobble;
    const width = radius * (0.72 + Math.random() * 0.22);
    const height = radius * (0.3 + Math.random() * 0.12);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + (Math.random() - 0.5) * 0.08);
    ctx.fillStyle = rgbToCss(paint, alpha * (0.7 + Math.random() * 0.45));
    ctx.beginPath();
    ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 中央だけ少し濃くして、指腹でぬぐった跡の芯を作る。
  ctx.save();
  ctx.translate(cx + ux * carry * 0.35, cy + uy * carry * 0.35);
  ctx.rotate(angle);
  ctx.fillStyle = rgbToCss(paint, alpha * 0.8);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.5, radius * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBristleSmear(cx, cy, ux, uy, normalX, normalY, radius, strength, strengthCurve, paint, profile, usesPickedColorOnly) {
  const strandCount = Math.ceil(profile.strands + radius * profile.strandScale * (0.65 + strength * 0.7));

  for (let i = 0; i < strandCount; i += 1) {
    const keepChance = 1 - profile.skip * (1 - strength * 0.55);
    if (Math.random() > keepChance) continue;

    const lane = (Math.random() - 0.5) * radius * profile.lane;
    const wobble = (Math.random() - 0.5) * radius * profile.wobble;
    const startX = cx + normalX * lane - ux * radius * (0.08 + Math.random() * 0.18);
    const startY = cy + normalY * lane - uy * radius * (0.08 + Math.random() * 0.18);
    const lengthBoost = usesPickedColorOnly ? 0.22 : 0;
    const length = radius * (profile.minLength + strengthCurve * (profile.length + lengthBoost)) * (0.55 + Math.random() * 0.9);
    const endX = startX + ux * length + normalX * wobble;
    const endY = startY + uy * length + normalY * wobble;
    const width = Math.max(0.55, radius * (profile.widthMin + Math.random() * profile.widthMax));
    const alpha = 0.018 + strengthCurve * profile.alpha + Math.random() * 0.035;

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

function smearStroke(from, to, options = {}) {
  const radius = Number(brushInput.value);
  const strength = Number(smearInput.value) / 100;
  const strengthCurve = Math.pow(strength, 1.35);
  const profile = getTouchProfile();
  const usesPickedColorOnly = options.pickedColorOnly ?? false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.5) return;

  const ux = dx / distance;
  const uy = dy / distance;
  const normalX = -uy;
  const normalY = ux;
  const steps = Math.max(1, Math.ceil(distance / Math.max(2.5, radius * profile.step)));

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";

  for (let step = 0; step < steps; step += 1) {
    const t = step / steps;
    const cx = from.x + dx * t;
    const cy = from.y + dy * t;
    const paint = getSmearPaint(cx, cy, ux, uy, radius, strengthCurve, usesPickedColorOnly);

    if (profile.mode === "finger") {
      drawFingerSmear(cx, cy, ux, uy, normalX, normalY, radius, strengthCurve, paint, profile);
    } else {
      drawBristleSmear(cx, cy, ux, uy, normalX, normalY, radius, strength, strengthCurve, paint, profile, usesPickedColorOnly);
    }
  }

  ctx.restore();
}

function handlePointerDown(event) {
  event.preventDefault();
  pointerId = event.pointerId;
  canvas.setPointerCapture(pointerId);
  isPainting = true;
  smearOnly = event.metaKey;
  lastPoint = getCanvasPoint(event);
  lastDabTime = performance.now();
  if (!smearOnly) {
    paintBlob(lastPoint);
  }
}

function handlePointerMove(event) {
  if (!isPainting || event.pointerId !== pointerId || !lastPoint) return;
  event.preventDefault();
  const point = getCanvasPoint(event);
  smearStroke(lastPoint, point, { pickedColorOnly: smearOnly });
  lastPoint = point;

  // ゆっくり動かした時は、絵の具のかたまり感も少し残す。
  if (!smearOnly && performance.now() - lastDabTime > 90) {
    paintBlob(point);
    lastDabTime = performance.now();
  }
}

function handlePointerUp(event) {
  if (event.pointerId !== pointerId) return;
  isPainting = false;
  lastPoint = null;
  pointerId = null;
  smearOnly = false;
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
