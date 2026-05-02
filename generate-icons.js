#!/usr/bin/env node
// Gera icon-192.png, icon-512.png e icon-maskable.png
// Requer apenas Node.js built-ins (zlib, fs, path) — sem instalação.
'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 ────────────────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG encoder ──────────────────────────────────────────────────────────
function makePNG(w, h, pixels) {
  const rowBytes = w * 4 + 1;
  const raw = Buffer.alloc(rowBytes * h);
  for (let y = 0; y < h; y++) {
    raw[y * rowBytes] = 0;                          // filter: None
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * rowBytes + 1 + x * 4;
      raw[di]   = pixels[si];
      raw[di+1] = pixels[si+1];
      raw[di+2] = pixels[si+2];
      raw[di+3] = pixels[si+3];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const t   = Buffer.from(type, 'ascii');
    const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length, 0);
    const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;   // RGBA

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Canvas helper ────────────────────────────────────────────────────────
function makeCanvas(w, h) {
  const px = new Uint8Array(w * h * 4);
  return {
    fill(r, g, b, a=255) {
      for (let i = 0; i < w * h * 4; i += 4) {
        px[i]=r; px[i+1]=g; px[i+2]=b; px[i+3]=a;
      }
    },
    rect(x, y, rw, rh, r, g, b, a=255) {
      x=Math.round(x); y=Math.round(y); rw=Math.round(rw); rh=Math.round(rh);
      for (let dy=0; dy<rh; dy++) for (let dx=0; dx<rw; dx++) {
        const px_=x+dx, py_=y+dy;
        if (px_<0||px_>=w||py_<0||py_>=h) continue;
        const i=(py_*w+px_)*4;
        px[i]=r; px[i+1]=g; px[i+2]=b; px[i+3]=a;
      }
    },
    toPNG() { return makePNG(w, h, px); },
  };
}

// ── Fonte bitmap 5×7 ─────────────────────────────────────────────────────
// Cada row é um número de 5 bits: bit 4 = pixel esquerdo, bit 0 = direito.
const GLYPHS = {
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  A: [0b00100, 0b01010, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
};

function drawText(canvas, text, x, y, scale, r, g, b, a=255) {
  for (let ci = 0; ci < text.length; ci++) {
    const g_ = GLYPHS[text[ci]];
    if (!g_) { x += 6*scale; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 4; col >= 0; col--) {     // bit 4 = esquerda
        if ((g_[row] >> col) & 1)
          canvas.rect(x+(4-col)*scale, y+row*scale, scale, scale, r, g, b, a);
      }
    }
    x += 6 * scale;   // 5 px + 1 px gap
  }
}

function textW(n, scale) { return n > 0 ? (n * 6 - 1) * scale : 0; }

// ── Renderizador de ícone ─────────────────────────────────────────────────
function renderIcon(size, maskable=false) {
  const c = makeCanvas(size, size);
  c.fill(0x0f, 0x2d, 0x5e);    // fundo #0f2d5e

  const pad   = maskable ? Math.floor(size * 0.20) : Math.floor(size * 0.06);
  const avail = size - pad * 2;

  // "RB" ocupa ~62% da largura disponível
  const rbScale = Math.max(1, Math.floor(avail * 0.62 / textW(2, 1)));
  const rbW     = textW(2, rbScale);
  const rbH     = 7 * rbScale;

  // "FINANC" abaixo, escala ~38% da RB
  const smScale = Math.max(1, Math.floor(rbScale * 0.38));
  const smW     = textW(6, smScale);
  const smH     = 7 * smScale;

  const gap    = Math.max(1, Math.floor(rbScale * 0.55));
  const totalH = rbH + gap + smH;
  const topY   = pad + Math.floor((avail - totalH) / 2);

  drawText(c, 'RB',     Math.floor((size - rbW) / 2), topY,           rbScale, 255,255,255);
  drawText(c, 'FINANC', Math.floor((size - smW) / 2), topY+rbH+gap,   smScale, 255,255,255, 160);

  return c.toPNG();
}

// ── Gera os três arquivos ─────────────────────────────────────────────────
const ICONS = [
  ['icon-192.png',      192, false],
  ['icon-512.png',      512, false],
  ['icon-maskable.png', 512, true ],
];

for (const [name, size, maskable] of ICONS) {
  const buf = renderIcon(size, maskable);
  fs.writeFileSync(path.join(__dirname, name), buf);
  console.log(`✓ ${name}  (${size}×${size}, ${(buf.length/1024).toFixed(1)} KB)`);
}
