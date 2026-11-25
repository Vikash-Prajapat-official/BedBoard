// Draws the app icons (a bed on a blue tile, three status dots above it) and writes PNG files.
// No image library needed: a PNG is just zlib-compressed rows with a CRC. Run: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BLUE = [29, 78, 216]; // #1D4ED8
const WHITE = [255, 255, 255];
const PILLOW = [191, 219, 254];
const DOTS = [[22, 163, 74], [245, 158, 11], [185, 28, 28]]; // free, discharge planned, blocked

// Shapes in a 0..1 square, kept inside the middle 60% so the icon survives a circular "maskable" crop.
const shapes = [
  { x: 0.22, y: 0.52, w: 0.56, h: 0.1, c: WHITE }, // mattress
  { x: 0.22, y: 0.38, w: 0.06, h: 0.32, c: WHITE }, // headboard
  { x: 0.72, y: 0.48, w: 0.06, h: 0.22, c: WHITE }, // footboard
  { x: 0.31, y: 0.43, w: 0.15, h: 0.07, c: PILLOW }, // pillow
  ...DOTS.map((c, i) => ({ x: 0.31 + i * 0.13, y: 0.24, w: 0.09, h: 0.09, c })),
];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const hit = shapes.find((s) => nx >= s.x && nx < s.x + s.w && ny >= s.y && ny < s.y + s.h);
      const [r, g, b] = hit ? hit.c : BLUE;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["icon-maskable-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(`public/icons/${name}`, png(size));
  console.log("wrote public/icons/" + name);
}
