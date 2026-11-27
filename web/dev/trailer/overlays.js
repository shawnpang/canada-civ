// Trailer overlays, drawn in output pixels (1920×1080) on top of the rendered map: title and end cards, captions,
// chips, the lens legend, the City View panel and the moving caravans on trade routes. Canvas 2D only, using the
// app's own icon and citizen painters.
// Simple decorative markers; the live atlas has no dependency on these trailer overlays.
const hasIcon = () => false;
const drawIcon = () => {};
const drawCitizen = () => {};

export const SERIF = '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
export const SANS = '-apple-system, "Helvetica Neue", "Segoe UI", system-ui, sans-serif';
const GOLD = "#c9a45c", GOLD_HI = "#ecd08e", INK = "#efe4c6", INK_DIM = "#b9ab88";

// --- timing helpers -----------------------------------------------------------------------------------------------
export const clamp01 = (t) => Math.max(0, Math.min(1, t));
export const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
export const easeOut = (t) => { t = clamp01(t); return 1 - (1 - t) ** 3; };
export const lerp = (a, b, t) => a + (b - a) * t;
/** 0 before `a`, eased up to 1 over `fin` s, held, eased down to 0 over `fout` s ending at `b`. */
export function win(t, a, b, fin = 0.35, fout = 0.35) {
  if (t < a || t > b) return 0;
  return Math.min(fin > 0 ? smooth((t - a) / fin) : 1, fout > 0 ? smooth((b - t) / fout) : 1);
}

function spacing(ctx, px) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

// --- frame treatments ---------------------------------------------------------------------------------------------
export function vignette(ctx, W, H, k = 0.55) {
  if (k <= 0) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, "rgba(4,8,14,0)");
  g.addColorStop(1, `rgba(4,8,14,${k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function darken(ctx, W, H, a) {
  if (a <= 0) return;
  ctx.fillStyle = `rgba(5,9,15,${a})`;
  ctx.fillRect(0, 0, W, H);
}

/** A horizontal band of shade behind captions: transparent at the top edge, `a` at the bottom. */
function bottomShade(ctx, W, H, h, a) {
  const g = ctx.createLinearGradient(0, H - h, 0, H);
  g.addColorStop(0, "rgba(5,9,15,0)");
  g.addColorStop(0.55, `rgba(5,9,15,${a * 0.75})`);
  g.addColorStop(1, `rgba(5,9,15,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, H - h, W, h);
}

// Draw a stylised maple leaf directly, with no external art asset.
function emblem(ctx, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fillStyle = "#120d06"; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = "#c9a45c"; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r * .84, 0, Math.PI * 2); ctx.fillStyle = "#75342e"; ctx.fill();
  const points = [[0,-.63],[.14,-.31],[.28,-.43],[.25,-.15],[.57,-.25],[.45,-.02],[.57,.08],[.16,.27],[.19,.49],[0,.39],[-.19,.49],[-.16,.27],[-.57,.08],[-.45,-.02],[-.57,-.25],[-.25,-.15],[-.28,-.43],[-.14,-.31]];
  ctx.beginPath(); points.forEach(([px,py],i) => i ? ctx.lineTo(x+px*r,y+py*r) : ctx.moveTo(x+px*r,y+py*r)); ctx.closePath(); ctx.fillStyle = "#fff0cb"; ctx.fill();
  ctx.fillRect(x-r*.025,y+r*.32,r*.05,r*.28);
}

// An ornamental rule: line – diamond – line.
function ornament(ctx, cx, y, half, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
  g.addColorStop(0, "rgba(201,164,92,0)");
  g.addColorStop(0.5, "rgba(236,208,142,1)");
  g.addColorStop(1, "rgba(201,164,92,0)");
  ctx.fillStyle = g;
  ctx.fillRect(cx - half, y - 1, half - 18, 2);
  ctx.fillRect(cx + 18, y - 1, half - 18, 2);
  ctx.beginPath();
  ctx.moveTo(cx, y - 7); ctx.lineTo(cx + 9, y); ctx.lineTo(cx, y + 7); ctx.lineTo(cx - 9, y); ctx.closePath();
  ctx.fillStyle = GOLD_HI;
  ctx.fill();
  ctx.restore();
}

/** Gold, engraved serif text (centred at x). */
function goldText(ctx, text, x, y, px, { track = 0.12, align = "center", weight = "bold" } = {}) {
  ctx.save();
  ctx.font = `${weight} ${px}px ${SERIF}`;
  spacing(ctx, px * track);
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  // drop shadow
  ctx.fillStyle = "rgba(0,0,0,.75)";
  ctx.shadowColor = "rgba(0,0,0,.8)";
  ctx.shadowBlur = px * 0.25;
  ctx.fillText(text, x, y + px * 0.04);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  const g = ctx.createLinearGradient(0, y - px * 0.8, 0, y + px * 0.1);
  g.addColorStop(0, "#fff0c4");
  g.addColorStop(0.45, "#ecd08e");
  g.addColorStop(0.55, "#c9a45c");
  g.addColorStop(1, "#8f6a2c");
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  ctx.lineWidth = Math.max(1, px / 60);
  ctx.strokeStyle = "rgba(60,40,10,.55)";
  ctx.strokeText(text, x, y);
  ctx.restore();
}

function plainText(ctx, text, x, y, font, color, { align = "center", track = 0, shadow = true } = {}) {
  ctx.save();
  ctx.font = font;
  spacing(ctx, track);
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  if (shadow) {
    ctx.shadowColor = "rgba(0,0,0,.85)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// --- title and end cards ------------------------------------------------------------------------------------------

/** k: 0..1 reveal progress (the title's tracking eases in). */
export function titleCard(ctx, W, H, cfg, alpha, k = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const cy = H * 0.46;
  emblem(ctx, W / 2, cy - 170, 38);
  goldText(ctx, cfg.title.toUpperCase(), W / 2, cy, 118, { track: 0.06 + 0.06 * easeOut(k) });
  ornament(ctx, W / 2, cy + 44, 360, smooth(k * 1.4 - 0.2));
  if (cfg.subtitle) plainText(ctx, cfg.subtitle, W / 2, cy + 108, `italic 46px ${SERIF}`, INK, { track: 0.5 });
  ctx.restore();
}

export function endCard(ctx, W, H, cfg, lines, alpha, k = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const cy = H * 0.42;
  emblem(ctx, W / 2, cy - 160, 36);
  goldText(ctx, cfg.title.toUpperCase(), W / 2, cy, 104, { track: 0.11 });
  ornament(ctx, W / 2, cy + 40, 340);
  if (cfg.subtitle) plainText(ctx, cfg.subtitle, W / 2, cy + 102, `italic 42px ${SERIF}`, INK, { track: 0.4 });
  ctx.globalAlpha = alpha * smooth(k * 2);
  plainText(ctx, lines.facts, W / 2, cy + 196, `600 38px ${SANS}`, GOLD_HI, { track: 1.5 });
  const cta = cfg.url || lines.fallback;
  if (cta) {
    ctx.globalAlpha = alpha * smooth(k * 2 - 0.4);
    plainText(ctx, cta, W / 2, cy + 290, `600 ${cfg.url ? 54 : 44}px ${SANS}`, "#ffffff", { track: cfg.url ? 1 : 3 });
  }
  ctx.restore();
}

// --- captions -----------------------------------------------------------------------------------------------------

/**
 * Lower-left caption: {kicker (small caps, gold), title (big serif), sub (sans), source (small)}. `p` is the reveal
 * progress used to slide it up.
 */
export function caption(ctx, W, H, c, alpha, p = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  bottomShade(ctx, W, H, 420, 0.9);
  const x = 96;
  let y = H - 92 + (1 - easeOut(p)) * 30;
  if (c.source) {
    plainText(ctx, c.source, x, y, `500 30px ${SANS}`, "#cfc29f", { align: "left", track: 0.5 });
    y -= 58;
  }
  if (c.sub) {
    plainText(ctx, c.sub, x, y, `600 42px ${SANS}`, INK, { align: "left" });
    y -= 70;
  }
  if (c.title) {
    goldText(ctx, c.title, x, y, 78, { align: "left", track: 0.03 });
    y -= 92;
  }
  if (c.kicker) {
    ctx.fillStyle = GOLD;
    ctx.fillRect(x, y - 13, 46, 3);
    plainText(ctx, c.kicker.toUpperCase(), x + 62, y, `600 28px ${SANS}`, GOLD_HI, { align: "left", track: 5 });
  }
  ctx.restore();
}

/** A pill chip with an icon medallion: {icon, label, sub}. Returns its height. (x, y) = top-left. */
export function chip(ctx, x, y, c, alpha, { size = 1 } = {}) {
  if (alpha <= 0) return 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  const h = 76 * size, ic = 58 * size;
  ctx.font = `bold ${36 * size}px ${SERIF}`;
  spacing(ctx, 1.5);
  const lw = ctx.measureText(c.label).width;
  ctx.font = `500 ${25 * size}px ${SANS}`;
  spacing(ctx, 0.4);
  const sw = c.sub ? ctx.measureText(c.sub).width : 0;
  const wdt = h + 18 * size + Math.max(lw, sw) + 34 * size;
  const r = h / 2;
  ctx.beginPath();
  ctx.roundRect(x, y, wdt, h, r);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(36,54,74,.94)");
  g.addColorStop(1, "rgba(17,26,37,.94)");
  ctx.fillStyle = g;
  ctx.shadowColor = "rgba(0,0,0,.6)";
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  if (c.icon && hasIcon(c.icon)) drawIcon(ctx, c.icon, x + r, y + r, ic, { shadow: true });
  const tx = x + h + 14 * size;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `bold ${36 * size}px ${SERIF}`;
  spacing(ctx, 1.5);
  ctx.fillStyle = GOLD_HI;
  ctx.fillText(c.label, tx, y + (c.sub ? 38 : 50) * size);
  if (c.sub) {
    ctx.font = `500 ${25 * size}px ${SANS}`;
    spacing(ctx, 0.4);
    ctx.fillStyle = "#cfc29f";
    ctx.fillText(c.sub, tx, y + 65 * size);
  }
  ctx.restore();
  return h;
}

/**
 * The lens legend, top-right: name + unit + a colour ramp with its end values. During a change from A to B (k 0..1)
 * the box stays put, the ramp crossfades and the text never overlaps: A's text slides up and out over the first
 * half, B's rises in over the second.
 */
export function lensLegend(ctx, W, H, A, alpha, B = null, k = 0) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const wdt = 620, x = W - wdt - 80, y = 70, h = 196;
  ctx.beginPath();
  ctx.roundRect(x, y, wdt, h, 14);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(36,54,74,.95)");
  g.addColorStop(1, "rgba(15,23,33,.95)");
  ctx.fillStyle = g;
  ctx.shadowColor = "rgba(0,0,0,.6)";
  ctx.shadowBlur = 24;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  const rx = x + 34, ry = y + 118, rw = wdt - 68, rh = 22;
  ctx.fillStyle = "rgba(0,0,0,.7)";
  ctx.fillRect(rx - 2, ry - 2, rw + 4, rh + 4);
  const ramp = (L, a) => {
    if (a <= 0) return;
    const rg = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    if (L.categories) {
      L.categories.forEach((c, i) => { const left=i/L.categories.length, right=(i+1)/L.categories.length; rg.addColorStop(left,c.color); rg.addColorStop(right,c.color); });
    } else L.ramp.forEach((c, i) => rg.addColorStop(i / (L.ramp.length - 1), c));
    ctx.globalAlpha = alpha * a;
    ctx.fillStyle = rg;
    ctx.fillRect(rx, ry, rw, rh);
  };
  ramp(A, 1);
  if (B) ramp(B, smooth(k));
  const text = (L, a, dy) => {
    if (a <= 0) return;
    ctx.globalAlpha = alpha * a;
    if (L.icon && hasIcon(L.icon)) drawIcon(ctx, L.icon, x + 58, y + 58 + dy, 66, { shadow: true });
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `bold 46px ${SERIF}`;
    spacing(ctx, 3);
    ctx.fillStyle = GOLD_HI;
    ctx.fillText(L.name.toUpperCase(), x + 110, y + 62 + dy, wdt - 140);
    ctx.font = `500 23px ${SANS}`;
    spacing(ctx, 0.3);
    ctx.fillStyle = INK_DIM;
    ctx.fillText(L.unit, x + 112, y + 94 + dy, wdt - 140);
    ctx.font = `600 25px ${SANS}`;
    spacing(ctx, 0);
    ctx.fillStyle = INK;
    if (L.categories) {
      ctx.font = `600 17px ${SANS}`; ctx.textAlign = "center";
      L.categories.forEach((category, i) => {
        const name = category.name.en.replace(" Québécois", "").replace("-New Democratic Party", "").replace(" Party", "");
        ctx.fillText(name, rx + rw * (i + .5) / L.categories.length, ry + rh + 28 + dy * .4, rw / L.categories.length - 4);
      });
    } else {
      ctx.textAlign = "left"; ctx.fillText(L.lo || "", rx, ry + rh + 34 + dy * 0.4);
      ctx.textAlign = "right"; ctx.fillText(L.hi || "", rx + rw, ry + rh + 34 + dy * 0.4);
    }
  };
  if (B && k > 0) {
    const out = smooth(k / 0.55), inn = smooth((k - 0.45) / 0.55);
    text(A, 1 - out, -28 * out);
    text(B, inn, 28 * (1 - inn));
  } else text(A, 1, 0);
  ctx.restore();
  ctx.restore();
}

/** A gold ring that pulses around a point on the map (to point at the city a caption names). */
export function pulseRing(ctx, x, y, r, alpha, t) {
  if (alpha <= 0) return;
  ctx.save();
  for (let i = 0; i < 2; i++) {
    const p = ((t * 0.9 + i * 0.5) % 1);
    ctx.globalAlpha = alpha * (1 - p) * 0.85;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.75 + 0.6 * p), 0, Math.PI * 2);
    ctx.lineWidth = 5 * (1 - p) + 1.5;
    ctx.strokeStyle = GOLD_HI;
    ctx.shadowColor = "rgba(255,210,120,.9)";
    ctx.shadowBlur = 18;
    ctx.stroke();
  }
  ctx.restore();
}

// --- City View panel ----------------------------------------------------------------------------------------------

/**
 * The city "screen": a right-hand panel in the style of the app's City View dock.
 * P = {name, full, badge: {label, color, icon}, stats: [[value, label]], rows: [{label, figs: [kind…], hi: kind,
 *      ratio}], highlight (what the glowing figures are), districts: [{icon, name, line}], source}
 * slide: 0..1 (slides in from the right).
 */
export function cityPanel(ctx, W, H, P, alpha, slide, tt) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha;
  const pw = 820, x = W - pw - 56 + (1 - easeOut(slide)) * (pw + 80), y = 56, h = H - 112;
  ctx.beginPath(); ctx.roundRect(x, y, pw, h, 16);
  const g = ctx.createLinearGradient(0, y, 0, y+h); g.addColorStop(0, "rgba(30,46,64,.97)"); g.addColorStop(1, "rgba(12,19,28,.97)");
  ctx.fillStyle=g; ctx.shadowColor="rgba(0,0,0,.7)"; ctx.shadowBlur=30; ctx.fill(); ctx.shadowBlur=0; ctx.lineWidth=2.5; ctx.strokeStyle=GOLD; ctx.stroke();
  const px=x+44; let cy=y+92;
  goldText(ctx,P.name.toUpperCase(),px,cy,64,{align:"left",track:.08});
  ctx.textAlign="left"; ctx.fillStyle=INK_DIM; ctx.font=`500 24px ${SANS}`; ctx.fillText(P.full,px,cy+42);
  ctx.fillStyle=GOLD; ctx.fillRect(px,cy+65,pw-88,2); cy+=135;
  const colW=(pw-88)/P.stats.length;
  P.stats.forEach(([val,lab],i)=>{ctx.fillStyle=INK;ctx.font=`bold 45px ${SERIF}`;ctx.fillText(val,px+i*colW,cy);ctx.fillStyle=INK_DIM;ctx.font=`500 20px ${SANS}`;ctx.fillText(lab.toUpperCase(),px+i*colW,cy+32);});
  cy+=75; ctx.fillStyle=GOLD;ctx.fillRect(px,cy,pw-88,2);cy+=57;
  ctx.fillStyle=GOLD_HI;ctx.font=`600 26px ${SANS}`;ctx.fillText("CITY SPECIALISATION",px,cy); cy+=52;
  ctx.font=`bold 36px ${SERIF}`;ctx.fillStyle=INK;ctx.fillText(P.badge.label,px,cy,pw-88);cy+=54;
  ctx.fillStyle=INK_DIM;ctx.font=`500 23px ${SANS}`;ctx.fillText("Employment of residents relative to Canada",px,cy); cy+=57;
  ctx.fillStyle=GOLD;ctx.fillRect(px,cy,pw-88,2);cy+=55;
  ctx.fillStyle=GOLD_HI;ctx.font=`600 26px ${SANS}`;ctx.fillText("DISTRICTS",px,cy);cy+=28;
  P.districts.forEach((d,i)=>{const a=smooth((tt-.5-i*.2)/.3);ctx.save();ctx.globalAlpha*=a;let dy=cy+i*90;ctx.fillStyle=INK;ctx.font=`bold 32px ${SERIF}`;ctx.fillText(d.name,px,dy+30,pw-105);ctx.fillStyle=INK_DIM;ctx.font=`500 23px ${SANS}`;ctx.fillText(d.line,px,dy+61,pw-105);ctx.restore();});
  ctx.fillStyle=INK_DIM;ctx.font=`500 19px ${SANS}`;ctx.fillText(P.source,px,y+h-30,pw-88);ctx.restore();
}

// --- caravans -----------------------------------------------------------------------------------------------------

function along(pts, len, t) {
  let goal = len * t;
  for (let k = 2; k < pts.length; k += 2) {
    const l = Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]);
    if (goal <= l || k === pts.length - 2) {
      const f = l ? Math.min(1, goal / l) : 0;
      return [pts[k - 2] + (pts[k] - pts[k - 2]) * f, pts[k - 1] + (pts[k + 1] - pts[k - 1]) * f];
    }
    goal -= l;
  }
  return [pts[0], pts[1]];
}

/**
 * Glowing goods moving along the trade routes (both directions: FAF flows are summed both ways).
 * toScreen(x, y) → output px. sec = shot time (s). reveal 0..1 grows each route from its start.
 */
export function caravans(ctx, routes, toScreen, sec, alpha, kpx = 1) {
  if (alpha <= 0 || !routes?.length) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  for (const rt of routes) {
    if (!rt.pts || !(rt.len > 0)) continue;
    const r = (rt.top ? 4.5 : 3.2) * kpx * (0.8 + 0.4 * (rt.weight ?? 0.5));
    const spacingKm = 420;
    const n = Math.max(1, Math.round(rt.len / spacingKm));
    const speed = 300; // km per second
    for (let i = 0; i < n; i++) {
      for (const dir of [1, -1]) {
        let f = ((sec * speed) / rt.len + i / n + (dir < 0 ? 0.5 / n : 0)) % 1;
        if (dir < 0) f = 1 - f;
        const [x, y] = along(rt.pts, rt.len, f);
        const [sx, sy] = toScreen(x, y);
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.6);
        g.addColorStop(0, "rgba(255,248,224,.95)");
        g.addColorStop(0.3, "rgba(255,206,110,.4)");
        g.addColorStop(1, "rgba(255,170,60,0)");
        ctx.fillStyle = g;
        ctx.fillRect(sx - r * 2.6, sy - r * 2.6, r * 5.2, r * 5.2);
      }
    }
  }
  ctx.restore();
}

/** A glowing, pulsing stroke along one route (the one a caption names). */
export function routeGlow(ctx, rt, toScreen, sec, alpha, widthPx = 8) {
  if (alpha <= 0 || !rt?.pts) return;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let k = 0; k < rt.pts.length; k += 2) {
    const [x, y] = toScreen(rt.pts[k], rt.pts[k + 1]);
    if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  const pulse = 0.75 + 0.25 * Math.sin(sec * 5);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha * 0.5 * pulse;
  ctx.strokeStyle = "rgba(255,190,90,1)";
  ctx.lineWidth = widthPx * 3;
  ctx.shadowColor = "rgba(255,200,110,1)";
  ctx.shadowBlur = widthPx * 3;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = alpha * pulse;
  ctx.strokeStyle = "rgba(255,244,214,1)";
  ctx.lineWidth = widthPx;
  ctx.stroke();
  ctx.restore();
}
