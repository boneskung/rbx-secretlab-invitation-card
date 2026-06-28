/* ===========================================================================
 * Invitation Card Tools — SECRET LABS
 * Pure client-side canvas renderer + template store. Talks to the local
 * server only to list/serve the Assets/images gallery.
 * ========================================================================= */

"use strict";

/* ----------------------------- constants -------------------------------- */
const FORMATS = {
  portrait: { w: 1080, h: 1350, label: "1080 × 1350" },
  square: { w: 1080, h: 1080, label: "1080 × 1080" },
};

const SUBJECTS = {
  club: { nameLabel: "ชื่อคลับ", modeLabel: "ชื่อคลับ", hint: "การ์ดเชิญในนามคลับ" },
  owner: { nameLabel: "ชื่อเจ้าของคลับ", modeLabel: "เจ้าของคลับ", hint: "การ์ดเชิญในนามเจ้าของคลับ" },
  player: { nameLabel: "ชื่อผู้เล่น", modeLabel: "ผู้เล่นเฉพาะ", hint: "การ์ดเชิญสำหรับผู้เล่นคนนั้น ๆ" },
};

const THEMES = [
  { name: "Gold Noir", accent: "#E5B567", overlayStyle: "bottom", overlay: 62, titleFont: "Cinzel", css: "linear-gradient(135deg,#1a1a1f,#2a2118 60%,#E5B567)" },
  { name: "Neon Red", accent: "#E2434E", overlayStyle: "bottom", overlay: 58, titleFont: "Bebas Neue", css: "linear-gradient(135deg,#16080a,#2a0d10 55%,#E2434E)" },
  { name: "Silver Chrome", accent: "#C9CDD6", overlayStyle: "vignette", overlay: 54, titleFont: "Playfair Display", css: "linear-gradient(135deg,#15151a,#3a3a44 60%,#C9CDD6)" },
  { name: "Royal Purple", accent: "#B98CFF", overlayStyle: "bottom", overlay: 60, titleFont: "Cinzel", css: "linear-gradient(135deg,#14101f,#241a3a 55%,#B98CFF)" },
  { name: "Emerald", accent: "#5FD0A8", overlayStyle: "vignette", overlay: 58, titleFont: "Playfair Display", css: "linear-gradient(135deg,#0c1816,#103029 55%,#5FD0A8)" },
];

const LOGO_POSITIONS = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];
const FONT_FAMILIES = ["Cinzel", "Playfair Display", "Bebas Neue", "Oswald", "Montserrat", "Kanit", "Prompt"];
const TPL_KEY = "secretlabs.invitationcard.templates.v1";

/* ----------------------------- state ------------------------------------ */
const S = {
  format: "portrait",
  subject: "club",
  bgSrc: null,
  bgZoom: 1.0,
  bgX: 0,
  bgY: 0,
  kicker: "YOU'RE INVITED",
  mainName: "SECRET LABS",
  supporting: "DANCE TOGETHER",
  dateLine: "FRI · 9:00 PM",
  venueLine: "MAIN FLOOR",
  footer: "SECRET LABS · DANCE HALL",
  titleFont: "Cinzel",
  bodyFont: "Montserrat",
  titleSize: 100,
  align: "center",
  textPos: "bottom",
  logoOn: true,
  logoLayout: "pair",
  clubLogoSrc: null,
  logoSepOn: true,
  nameWithLogo: true,
  logoPos: "tc",
  logoSize: 22,
  logoOpacity: 100,
  accentColor: "#E5B567",
  overlay: 62,
  overlayStyle: "bottom",
  frameOn: true,
  grainOn: false,
};

const els = {};
const imgCache = new Map();
let logoImg = null;
let clubLogoImg = null;
let noiseTile = null;

/* ----------------------------- helpers ---------------------------------- */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  imgCache.set(src, p);
  return p;
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 1900);
}

function fontStack(family) {
  return `"${family}", "Kanit", system-ui, sans-serif`;
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

/* draw text with manual letter-spacing, honouring alignment */
function drawSpaced(ctx, text, cx, baseline, font, color, spacing, align) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const chars = [...text];
  let total = 0;
  const widths = chars.map((c) => ctx.measureText(c).width);
  total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let x = align === "center" ? cx - total / 2 : align === "right" ? cx - total : cx;
  chars.forEach((c, i) => {
    ctx.fillText(c, x, baseline);
    x += widths[i] + spacing;
  });
  ctx.restore();
  return total;
}

/* word-wrap to a max width, returns array of lines */
function wrapText(ctx, text, font, maxW) {
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = line + " " + words[i];
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = words[i];
    } else line = test;
  }
  lines.push(line);
  return lines;
}

function makeNoise() {
  const n = document.createElement("canvas");
  n.width = n.height = 128;
  const nc = n.getContext("2d");
  const id = nc.createImageData(128, 128);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  nc.putImageData(id, 0, 0);
  return n;
}

/* ===========================================================================
 * RENDER
 * ========================================================================= */
async function render(canvas, scale = 1) {
  const fmt = FORMATS[S.format];
  const W = fmt.w * scale;
  const H = fmt.h * scale;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const u = W / 1080; // layout unit (authored at 1080 width)
  const accent = S.accentColor;

  ctx.clearRect(0, 0, W, H);

  /* 1. background ------------------------------------------------------- */
  const bg = S.bgSrc ? await loadImage(S.bgSrc) : null;
  if (bg) {
    const ir = bg.width / bg.height;
    const cr = W / H;
    let dw, dh;
    if (ir > cr) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; }
    dw *= S.bgZoom; dh *= S.bgZoom;
    const ox = (dw - W) / 2, oy = (dh - H) / 2;
    const dx = (W - dw) / 2 + clamp(S.bgX, -1, 1) * ox;
    const dy = (H - dh) / 2 + clamp(S.bgY, -1, 1) * oy;
    ctx.drawImage(bg, dx, dy, dw, dh);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#16161c");
    g.addColorStop(0.55, "#0e0e12");
    g.addColorStop(1, "#070708");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* 2. overlay for legibility ------------------------------------------ */
  const str = S.overlay / 100;
  // a faint global darken always helps text pop
  ctx.fillStyle = rgba("#000000", str * 0.18);
  ctx.fillRect(0, 0, W, H);

  if (S.overlayStyle === "bottom" || S.overlayStyle === "top") {
    const top = S.overlayStyle === "top";
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (top) {
      g.addColorStop(0, rgba("#000000", str));
      g.addColorStop(0.55, rgba("#000000", 0));
    } else {
      g.addColorStop(0.42, rgba("#000000", 0));
      g.addColorStop(1, rgba("#000000", str));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (S.overlayStyle === "full") {
    ctx.fillStyle = rgba("#000000", str * 0.62);
    ctx.fillRect(0, 0, W, H);
  } else if (S.overlayStyle === "vignette") {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, rgba("#000000", 0));
    g.addColorStop(1, rgba("#000000", str));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* 3. decorative frame ------------------------------------------------- */
  if (S.frameOn) {
    const m = 30 * u;
    ctx.save();
    ctx.strokeStyle = rgba(accent, 0.7);
    ctx.lineWidth = 2.2 * u;
    roundRectPath(ctx, m, m, W - m * 2, H - m * 2, 8 * u);
    ctx.stroke();
    ctx.strokeStyle = rgba("#ffffff", 0.16);
    ctx.lineWidth = 1 * u;
    roundRectPath(ctx, m + 7 * u, m + 7 * u, W - (m + 7 * u) * 2, H - (m + 7 * u) * 2, 6 * u);
    ctx.stroke();
    ctx.restore();
  }

  /* 4. logo lockup (single SECRET LABS, or paired with invited club) ----- */
  const logoBottom = drawLogoLockup(ctx, W, H, u, accent);

  /* 5. text content ----------------------------------------------------- */
  drawContent(ctx, W, H, u, accent, logoBottom);

  /* 6. footer (pinned bottom-centre) ------------------------------------ */
  if (S.footer.trim()) {
    const fy = H - 50 * u;
    drawSpaced(
      ctx,
      S.footer.toUpperCase(),
      W / 2,
      fy,
      `600 ${20 * u}px ${fontStack(S.bodyFont)}`,
      rgba("#ffffff", 0.62),
      5 * u,
      "center"
    );
  }

  /* 7. grain ------------------------------------------------------------ */
  if (S.grainOn) {
    if (!noiseTile) noiseTile = makeNoise();
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.globalCompositeOperation = "overlay";
    const pat = ctx.createPattern(noiseTile, "repeat");
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* is there a logo pinned to the top edge? (affects text top-padding) */
function logoAtTop() {
  if (S.logoPos[0] !== "t") return false;
  const single = S.logoOn && logoImg;
  const club = S.logoLayout === "pair" && clubLogoImg;
  return !!(single || club);
}

/* Draw the logo(s). Single = SECRET LABS only (9 positions).
 * Pair = SECRET LABS × invited-club logo, unified height, side by side. */
function drawLogoLockup(ctx, W, H, u, accent) {
  const pad = 56 * u;
  const v = S.logoPos[0], hh = S.logoPos[1];
  const pair = S.logoLayout === "pair" && S.logoOn && logoImg && clubLogoImg;

  if (!pair) {
    if (!(S.logoOn && logoImg)) return null;
    const lw = W * (S.logoSize / 100);
    const lh = lw * (logoImg.height / logoImg.width);
    let lx, ly;
    if (hh === "l") lx = pad;
    else if (hh === "r") lx = W - pad - lw;
    else lx = (W - lw) / 2;
    if (v === "t") ly = pad;
    else if (v === "b") ly = H - pad - lh;
    else ly = (H - lh) / 2;
    ctx.save();
    ctx.globalAlpha = S.logoOpacity / 100;
    ctx.drawImage(logoImg, lx, ly, lw, lh);
    ctx.restore();
    return ly + lh;
  }

  // paired collab lockup
  const targetH = W * (S.logoSize / 100) * 0.62;
  const aW = targetH * (logoImg.width / logoImg.height);
  const bW = targetH * (clubLogoImg.width / clubLogoImg.height);
  const gap = 34 * u;
  const sepFont = `300 ${targetH * 0.5}px ${fontStack(S.bodyFont)}`;
  let sepW = 0;
  if (S.logoSepOn) {
    ctx.save();
    ctx.font = sepFont;
    sepW = ctx.measureText("×").width;
    ctx.restore();
  }
  const totalW = aW + gap + (S.logoSepOn ? sepW + gap : 0) + bW;

  let startX;
  if (hh === "l") startX = pad;
  else if (hh === "r") startX = W - pad - totalW;
  else startX = (W - totalW) / 2;
  let topY;
  if (v === "t") topY = pad;
  else if (v === "b") topY = H - pad - targetH;
  else topY = (H - targetH) / 2;

  ctx.save();
  ctx.globalAlpha = S.logoOpacity / 100;
  let x = startX;
  ctx.drawImage(logoImg, x, topY, aW, targetH);
  x += aW + gap;
  if (S.logoSepOn) {
    ctx.save();
    ctx.globalAlpha = (S.logoOpacity / 100) * 0.85;
    ctx.font = sepFont;
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("×", x + sepW / 2, topY + targetH / 2);
    ctx.restore();
    x += sepW + gap;
  }
  ctx.drawImage(clubLogoImg, x, topY, bW, targetH);
  ctx.restore();
  return topY + targetH;
}

/* Build the named text sections (each {h,gap,draw} or null when empty). */
function buildSections(ctx, W, H, u, accent) {
  const margin = 96 * u;
  const align = S.align;
  const anchorX = align === "left" ? margin : align === "right" ? W - margin : W / 2;
  const maxW = W - margin * 2;

  const titlePx = 118 * u * (S.titleSize / 100);
  const titleFont = `700 ${titlePx}px ${fontStack(S.titleFont)}`;
  const titleLines = wrapText(ctx, (S.mainName || "").toUpperCase(), titleFont, maxW);

  const sec = {};

  sec.kicker = S.kicker.trim()
    ? {
        h: 28 * u,
        gap: 22 * u,
        draw: (y) => {
          const px = 28 * u;
          drawSpaced(ctx, S.kicker.toUpperCase(), anchorX, y + px, `600 ${px}px ${fontStack(S.bodyFont)}`, accent, 7 * u, align);
        },
      }
    : null;

  sec.title = titleLines.length
    ? {
        h: titlePx * 1.04 * titleLines.length - titlePx * 0.18,
        gap: 24 * u,
        draw: (y) => {
          const lh = titlePx * 1.04;
          ctx.save();
          ctx.font = titleFont;
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = align;
          ctx.textBaseline = "alphabetic";
          ctx.shadowColor = "rgba(0,0,0,0.55)";
          ctx.shadowBlur = 18 * u;
          ctx.shadowOffsetY = 3 * u;
          titleLines.forEach((ln, i) => ctx.fillText(ln, anchorX, y + titlePx + i * lh));
          ctx.restore();
        },
      }
    : null;

  sec.divider = {
    h: 3 * u,
    gap: 26 * u,
    draw: (y) => {
      const dw = 110 * u;
      const dx = align === "left" ? anchorX : align === "right" ? anchorX - dw : anchorX - dw / 2;
      ctx.save();
      ctx.fillStyle = accent;
      ctx.fillRect(dx, y, dw, 3 * u);
      ctx.fillStyle = rgba(accent, 0.9);
      ctx.beginPath();
      ctx.arc(align === "left" ? dx + dw + 12 * u : align === "right" ? dx - 12 * u : anchorX, y + 1.5 * u, 4 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  };

  sec.supporting = S.supporting.trim()
    ? {
        h: 34 * u,
        gap: 22 * u,
        draw: (y) => {
          const px = 34 * u;
          drawSpaced(ctx, S.supporting.toUpperCase(), anchorX, y + px, `500 ${px}px ${fontStack(S.bodyFont)}`, rgba("#ffffff", 0.9), 4 * u, align);
        },
      }
    : null;

  const detail = [S.dateLine.trim(), S.venueLine.trim()].filter(Boolean).join("   •   ");
  sec.detail = detail
    ? {
        h: 24 * u,
        gap: 0,
        draw: (y) => {
          const px = 24 * u;
          drawSpaced(ctx, detail.toUpperCase(), anchorX, y + px, `500 ${px}px ${fontStack(S.bodyFont)}`, rgba(accent, 0.92), 3 * u, align);
        },
      }
    : null;

  return sec;
}

function sectionsHeight(list) {
  return list.reduce((a, it, i) => a + it.h + (i < list.length - 1 ? it.gap : 0), 0);
}
function drawSectionList(list, startY) {
  let y = startY;
  list.forEach((it, i) => {
    it.draw(y);
    y += it.h + (i < list.length - 1 ? it.gap : 0);
  });
}

/* True when the invited-club name should ride with the paired logos up top. */
function clubNameGrouped() {
  return S.logoLayout === "pair" && S.nameWithLogo && S.logoOn && logoImg && clubLogoImg;
}

function drawContent(ctx, W, H, u, accent, logoBottom) {
  const sec = buildSections(ctx, W, H, u, accent);

  if (clubNameGrouped()) {
    // TOP group: kicker + club name + divider, flowing beneath the logo pair
    const top = [sec.kicker, sec.title, sec.divider].filter(Boolean);
    const topStart = S.logoPos[0] === "t" && logoBottom != null ? logoBottom + 46 * u : 150 * u;
    drawSectionList(top, topStart);

    // BOTTOM zone: supporting + date/venue (the "rarely edited" defaults)
    const bot = [sec.supporting, sec.detail].filter(Boolean);
    if (bot.length) {
      const botPad = 150 * u;
      drawSectionList(bot, H - botPad - sectionsHeight(bot));
    }
    return;
  }

  // default: one block positioned by textPos
  const all = [sec.kicker, sec.title, sec.divider, sec.supporting, sec.detail].filter(Boolean);
  const totalH = sectionsHeight(all);
  const topPad = (logoAtTop() ? 320 : 140) * u;
  const botPad = 150 * u;
  let startY;
  if (S.textPos === "top") startY = topPad;
  else if (S.textPos === "center") startY = (H - totalH) / 2;
  else startY = H - botPad - totalH;
  drawSectionList(all, startY);
}

/* ===========================================================================
 * PREVIEW pipeline (debounced)
 * ========================================================================= */
const card = $("card");
let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  const run = () => {
    if (!renderQueued) return; // already painted by the other scheduler
    renderQueued = false;
    render(card, 1);
  };
  // rAF keeps drags smooth; the timeout guarantees a paint even when rAF is
  // throttled (background tab) or never fires (headless render).
  requestAnimationFrame(run);
  setTimeout(run, 60);
}

/* ===========================================================================
 * CONTROL BINDINGS
 * ========================================================================= */
function syncLabels() {
  els.sizeLabel.textContent = FORMATS[S.format].label;
  els.modeLabel.textContent = SUBJECTS[S.subject].modeLabel;
  els.nameLabel.textContent = SUBJECTS[S.subject].nameLabel;
  els.subjectHint.textContent = SUBJECTS[S.subject].hint;
  els.zoomVal.textContent = Math.round(S.bgZoom * 100) + "%";
  els.titleSizeVal.textContent = S.titleSize + "%";
  els.logoSizeVal.textContent = S.logoSize + "%";
  els.logoOpacityVal.textContent = S.logoOpacity + "%";
  els.overlayVal.textContent = S.overlay + "%";
}

/* push S -> all UI controls (used after template load) */
function syncControls() {
  document.querySelectorAll("#formatSeg button").forEach((b) => b.classList.toggle("active", b.dataset.format === S.format));
  document.querySelectorAll("#subjectSeg button").forEach((b) => b.classList.toggle("active", b.dataset.subject === S.subject));
  document.querySelectorAll("#alignSeg button").forEach((b) => b.classList.toggle("active", b.dataset.align === S.align));
  document.querySelectorAll("#textPosSeg button").forEach((b) => b.classList.toggle("active", b.dataset.pos === S.textPos));
  document.querySelectorAll("#logoPosGrid button").forEach((b) => b.classList.toggle("active", b.dataset.pos === S.logoPos));
  document.querySelectorAll("#logoLayoutSeg button").forEach((b) => b.classList.toggle("active", b.dataset.layout === S.logoLayout));
  $("bgZoom").value = Math.round(S.bgZoom * 100);
  $("kicker").value = S.kicker;
  $("mainName").value = S.mainName;
  $("supporting").value = S.supporting;
  $("dateLine").value = S.dateLine;
  $("venueLine").value = S.venueLine;
  $("footer").value = S.footer;
  $("titleFont").value = S.titleFont;
  $("bodyFont").value = S.bodyFont;
  $("titleSize").value = S.titleSize;
  $("logoOn").checked = S.logoOn;
  $("logoSepOn").checked = S.logoSepOn;
  $("nameWithLogo").checked = S.nameWithLogo;
  $("logoSize").value = S.logoSize;
  $("logoOpacity").value = S.logoOpacity;
  $("accentColor").value = S.accentColor;
  $("overlay").value = S.overlay;
  $("overlayStyle").value = S.overlayStyle;
  $("frameOn").checked = S.frameOn;
  $("grainOn").checked = S.grainOn;
  highlightGalleryActive();
  highlightThemeActive();
  applyClubLogo();
  syncLabels();
  requestRender();
}

function bindSeg(containerId, key, attr, onChange) {
  document.querySelectorAll(`#${containerId} button`).forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(`#${containerId} button`).forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      S[key] = b.dataset[attr];
      onChange && onChange();
      syncLabels();
      requestRender();
    });
  });
}

function bindInput(id, key, transform, after) {
  const el = $(id);
  const ev = el.type === "checkbox" ? "change" : "input";
  el.addEventListener(ev, () => {
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (transform) v = transform(v);
    S[key] = v;
    after && after();
    syncLabels();
    requestRender();
  });
}

/* ----------------------------- gallery ---------------------------------- */
function highlightGalleryActive() {
  document.querySelectorAll("#gallery .thumb").forEach((t) => t.classList.toggle("active", t.dataset.url === S.bgSrc));
}

async function setBackground(src) {
  S.bgSrc = src;
  S.bgX = 0;
  S.bgY = 0;
  if (src) await loadImage(src);
  highlightGalleryActive();
  requestRender();
}

/* ----------------------------- club logo -------------------------------- */
function updateClubLogoUI() {
  const prev = $("clubLogoPrev");
  if (prev) {
    if (S.clubLogoSrc) {
      prev.innerHTML = "";
      const im = document.createElement("img");
      im.src = S.clubLogoSrc;
      prev.appendChild(im);
      prev.classList.add("has");
    } else {
      prev.textContent = "ยังไม่ได้แนบโลโก้คลับ";
      prev.classList.remove("has");
    }
  }
  const row = $("clubLogoRow");
  if (row) row.classList.toggle("dim", S.logoLayout !== "pair");
}

// load S.clubLogoSrc into the image cache, then repaint
async function applyClubLogo() {
  clubLogoImg = S.clubLogoSrc ? await loadImage(S.clubLogoSrc) : null;
  updateClubLogoUI();
  requestRender();
}

async function setClubLogo(src) {
  S.clubLogoSrc = src;
  if (src) {
    S.logoLayout = "pair"; // attaching a club logo implies the paired layout
    document.querySelectorAll("#logoLayoutSeg button").forEach((b) => b.classList.toggle("active", b.dataset.layout === "pair"));
  }
  await applyClubLogo();
}

function buildGallery(screens) {
  els.gallery.innerHTML = "";
  if (!screens.length) {
    els.gallery.innerHTML = '<p class="tpl-empty" style="grid-column:1/-1">ไม่พบรูปใน Screenshot/</p>';
    return;
  }
  screens.forEach((s) => {
    const d = document.createElement("div");
    d.className = "thumb";
    d.dataset.url = s.url;
    d.title = s.name;
    const im = document.createElement("img");
    im.src = s.url;
    im.loading = "lazy";
    d.appendChild(im);
    d.addEventListener("click", () => setBackground(s.url));
    els.gallery.appendChild(d);
  });
}

/* ----------------------------- themes ----------------------------------- */
function highlightThemeActive() {
  document.querySelectorAll("#themeSwatches .sw").forEach((s) => {
    const t = THEMES[+s.dataset.i];
    s.classList.toggle("active", t.accent.toLowerCase() === S.accentColor.toLowerCase() && t.overlayStyle === S.overlayStyle);
  });
}
function buildThemes() {
  els.themeSwatches.innerHTML = "";
  THEMES.forEach((t, i) => {
    const sw = document.createElement("div");
    sw.className = "sw";
    sw.dataset.i = i;
    sw.style.background = t.css;
    sw.title = t.name;
    sw.addEventListener("click", () => {
      S.accentColor = t.accent;
      S.overlayStyle = t.overlayStyle;
      S.overlay = t.overlay;
      S.titleFont = t.titleFont;
      syncControls();
      toast("ใช้ธีม: " + t.name);
    });
    els.themeSwatches.appendChild(sw);
  });
}

/* ----------------------------- logo grid -------------------------------- */
function buildLogoGrid() {
  els.logoPosGrid.innerHTML = "";
  LOGO_POSITIONS.forEach((p) => {
    const b = document.createElement("button");
    b.dataset.pos = p;
    b.title = p;
    if (p === S.logoPos) b.classList.add("active");
    b.addEventListener("click", () => {
      document.querySelectorAll("#logoPosGrid button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      S.logoPos = p;
      requestRender();
    });
    els.logoPosGrid.appendChild(b);
  });
}

/* ----------------------------- drag / zoom ------------------------------ */
function bindCanvasInteraction() {
  let dragging = false;
  let last = null;
  card.addEventListener("pointerdown", (e) => {
    if (!S.bgSrc) return;
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    card.classList.add("dragging");
    card.setPointerCapture(e.pointerId);
  });
  card.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const rect = card.getBoundingClientRect();
    const sx = card.width / rect.width;
    const sy = card.height / rect.height;
    const dxPx = (e.clientX - last.x) * sx;
    const dyPx = (e.clientY - last.y) * sy;
    // convert px shift to offset fraction relative to current overflow
    const bg = imgCache.get(S.bgSrc);
    S.bgX = clamp(S.bgX + dxPx / (card.width * 0.5), -1, 1);
    S.bgY = clamp(S.bgY + dyPx / (card.height * 0.5), -1, 1);
    last = { x: e.clientX, y: e.clientY };
    requestRender();
  });
  const stop = (e) => {
    dragging = false;
    card.classList.remove("dragging");
  };
  card.addEventListener("pointerup", stop);
  card.addEventListener("pointercancel", stop);
  card.addEventListener(
    "wheel",
    (e) => {
      if (!S.bgSrc) return;
      e.preventDefault();
      const next = clamp(S.bgZoom + (e.deltaY < 0 ? 0.06 : -0.06), 1, 3.2);
      S.bgZoom = next;
      $("bgZoom").value = Math.round(next * 100);
      syncLabels();
      requestRender();
    },
    { passive: false }
  );
}

/* ----------------------------- download --------------------------------- */
function sanitize(s) {
  return (s || "card").replace(/[^\w฀-๿-]+/g, "_").slice(0, 40) || "card";
}
async function download() {
  const tmp = document.createElement("canvas");
  await render(tmp, 2); // export at 2× for crispness
  const name = `invitation_${sanitize(S.subject)}_${sanitize(S.mainName)}_${S.format}.png`;
  tmp.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    toast("บันทึก " + name);
  }, "image/png");
}

/* ----------------------------- templates -------------------------------- */
function loadTemplates() {
  try {
    return JSON.parse(localStorage.getItem(TPL_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveTemplates(obj) {
  localStorage.setItem(TPL_KEY, JSON.stringify(obj));
}
function renderTemplateList() {
  const tpls = loadTemplates();
  const names = Object.keys(tpls).sort();
  els.tplList.innerHTML = "";
  if (!names.length) {
    els.tplList.innerHTML = '<p class="tpl-empty">ยังไม่มีเทมเพลต</p>';
    return;
  }
  names.forEach((nm) => {
    const item = document.createElement("div");
    item.className = "tpl-item";
    const label = document.createElement("span");
    label.className = "nm";
    label.textContent = nm;
    label.title = "คลิกเพื่อโหลด";
    label.addEventListener("click", () => {
      Object.assign(S, tpls[nm]);
      if (S.bgSrc) loadImage(S.bgSrc);
      syncControls();
      toast("โหลดเทมเพลต: " + nm);
    });
    const del = document.createElement("button");
    del.className = "x";
    del.textContent = "×";
    del.title = "ลบ";
    del.addEventListener("click", () => {
      const all = loadTemplates();
      delete all[nm];
      saveTemplates(all);
      renderTemplateList();
      toast("ลบ: " + nm);
    });
    item.append(label, del);
    els.tplList.appendChild(item);
  });
}
function saveCurrentTemplate() {
  const nm = ($("tplName").value || "").trim();
  if (!nm) {
    toast("ใส่ชื่อเทมเพลตก่อน");
    return;
  }
  const all = loadTemplates();
  all[nm] = JSON.parse(JSON.stringify(S));
  saveTemplates(all);
  $("tplName").value = "";
  renderTemplateList();
  toast("บันทึกเทมเพลต: " + nm);
}
function exportTemplates() {
  const data = JSON.stringify(loadTemplates(), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "invitation_templates.json";
  a.click();
  URL.revokeObjectURL(url);
}
function importTemplates(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      const all = Object.assign(loadTemplates(), incoming);
      saveTemplates(all);
      renderTemplateList();
      toast("นำเข้าเทมเพลตแล้ว");
    } catch {
      toast("ไฟล์ JSON ไม่ถูกต้อง");
    }
  };
  reader.readAsText(file);
}

/* ===========================================================================
 * INIT
 * ========================================================================= */
async function ensureFonts() {
  if (!document.fonts) return;
  try {
    await Promise.all(
      FONT_FAMILIES.flatMap((f) => [
        document.fonts.load(`400 80px "${f}"`),
        document.fonts.load(`700 80px "${f}"`),
      ])
    );
  } catch {}
}

async function init() {
  // cache label els
  ["sizeLabel", "modeLabel", "nameLabel", "subjectHint", "zoomVal", "titleSizeVal", "logoSizeVal", "logoOpacityVal", "overlayVal", "gallery", "themeSwatches", "logoPosGrid", "tplList"].forEach(
    (id) => (els[id] = $(id))
  );

  buildThemes();
  buildLogoGrid();
  updateClubLogoUI();
  renderTemplateList();

  // segmented controls
  bindSeg("formatSeg", "format", "format");
  bindSeg("subjectSeg", "subject", "subject");
  bindSeg("alignSeg", "align", "align");
  bindSeg("textPosSeg", "textPos", "pos");
  bindSeg("logoLayoutSeg", "logoLayout", "layout", updateClubLogoUI);

  // inputs
  bindInput("bgZoom", "bgZoom", (v) => +v / 100);
  bindInput("kicker", "kicker");
  bindInput("mainName", "mainName");
  bindInput("supporting", "supporting");
  bindInput("dateLine", "dateLine");
  bindInput("venueLine", "venueLine");
  bindInput("footer", "footer");
  bindInput("titleFont", "titleFont");
  bindInput("bodyFont", "bodyFont");
  bindInput("titleSize", "titleSize", (v) => +v);
  bindInput("logoOn", "logoOn");
  bindInput("logoSepOn", "logoSepOn");
  bindInput("nameWithLogo", "nameWithLogo");
  bindInput("logoSize", "logoSize", (v) => +v);
  bindInput("logoOpacity", "logoOpacity", (v) => +v);
  bindInput("accentColor", "accentColor", null, highlightThemeActive);
  bindInput("overlay", "overlay", (v) => +v);
  bindInput("overlayStyle", "overlayStyle", null, highlightThemeActive);
  bindInput("frameOn", "frameOn");
  bindInput("grainOn", "grainOn");

  // buttons
  $("downloadBtn").addEventListener("click", download);
  $("uploadBtn").addEventListener("click", () => $("uploadInput").click());
  $("uploadInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setBackground(r.result);
    r.readAsDataURL(f);
  });
  $("noBgBtn").addEventListener("click", () => setBackground(null));
  $("clubLogoBtn").addEventListener("click", () => $("clubLogoInput").click());
  $("clubLogoInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setClubLogo(r.result);
    r.readAsDataURL(f);
    e.target.value = ""; // allow re-selecting the same file
  });
  $("clubLogoClear").addEventListener("click", () => setClubLogo(null));
  $("bgResetBtn").addEventListener("click", () => {
    S.bgX = 0;
    S.bgY = 0;
    S.bgZoom = 1;
    $("bgZoom").value = 100;
    syncLabels();
    requestRender();
  });
  $("tplSaveBtn").addEventListener("click", saveCurrentTemplate);
  $("tplExportBtn").addEventListener("click", exportTemplates);
  $("tplImportBtn").addEventListener("click", () => $("tplImportInput").click());
  $("tplImportInput").addEventListener("change", (e) => e.target.files[0] && importTemplates(e.target.files[0]));

  bindCanvasInteraction();
  syncLabels();

  // assets come from the static manifest (assets-manifest.js) — no server needed
  const data = window.ASSETS || { logo: null, screenshots: [] };
  buildGallery(data.screenshots || []);
  if (data.logo) {
    logoImg = await loadImage(data.logo);
  }
  // default background = first screenshot
  if (data.screenshots && data.screenshots[0]) {
    await setBackground(data.screenshots[0].url);
  }

  await ensureFonts();
  requestRender();
  if (document.fonts) document.fonts.ready.then(requestRender);
}

init();
