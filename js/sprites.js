// Procedural 16-bit-RPG style pixel sprites. Each sheet: 7 frames of 24x24.
// Frames: 0 idle, 1 walk A, 2 walk B, 3 attack wind-up, 4 attack strike, 5 hurt, 6 down
import { BOSSES, ITEMS } from './data.js';
export const SIZE = 24;
export const FRAMES = 7;
const OUTLINE = '#1b1424';

class Pix {
  constructor(w = SIZE, h = SIZE) { this.w = w; this.h = h; this.p = new Array(w * h).fill(null); }
  set(x, y, c) { if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.p[y * this.w + x] : null; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  line(x0, y0, x1, y1, c) {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) { this.set(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  // scanline polygon fill
  poly(pts, c) {
    const ys = pts.map((q) => q[1]);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) this.set(x, y, c);
    }
    this.line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], c);
    for (let i = 0; i + 1 < pts.length; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c);
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) <= 1) this.set(cx + x, cy + y, c);
  }
  outline() {
    const src = this.p.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x]) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const v = (x + dx >= 0 && y + dy >= 0 && x + dx < this.w && y + dy < this.h) ? src[(y + dy) * this.w + x + dx] : null;
        return v && v !== OUTLINE && !v.startsWith('*');
      });
      if (n) this.p[y * this.w + x] = OUTLINE;
    }
  }
  draw(ctx, ox = 0, oy = 0) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      let c = this.p[y * this.w + x];
      if (!c) continue;
      if (c.startsWith('*')) c = c.slice(1); // glow pixels (no outline)
      ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

// ---------------- character configs ----------------
const C = {
  skin: '#f6c690', skinS: '#d8925c', eye: '#20142a', white: '#f4f4f0', steel: '#c8d0dc', steelS: '#7c8898',
  wood: '#8a5a2c', woodS: '#5c3a1c', gold: '#f0c040', boot: '#5a3420',
};

export const CHARS = {
  hero_sword:  { skin: C.skin, skinS: C.skinS, eye: C.eye, head: 'spiky', hair: '#a0502a', hairS: '#6c3018', body: 'tunic', tunic: '#3a66d0', tunicS: '#24408c', belt: '#e8c050', pants: '#46382c', boot: C.boot, weapon: 'sword' },
  hero_mage:   { skin: C.skin, skinS: C.skinS, eye: C.eye, head: 'wizard', hair: '#e0c060', hairS: '#a08030', hat: '#5040b0', hatS: '#302878', body: 'robe', tunic: '#5040b0', tunicS: '#302878', belt: '#f0c040', boot: '#302040', weapon: 'staff', orb: '#ff7a30' },
  hero_archer: { skin: C.skin, skinS: C.skinS, eye: C.eye, head: 'hood', hair: '#d0a040', hood: '#3c9a48', hoodS: '#24642c', body: 'tunic', tunic: '#3c9a48', tunicS: '#24642c', belt: '#8a5a2c', pants: '#6a5030', boot: C.boot, weapon: 'bow' },
  hero_shield: { skin: C.skin, skinS: C.skinS, eye: C.eye, head: 'helmet', metal: C.steel, metalS: C.steelS, plume: '#e03040', body: 'tunic', tunic: '#9aa6b8', tunicS: '#5c6878', belt: '#c03030', pants: '#505868', boot: '#3c4048', weapon: 'shield', shield: '#3a66d0', shieldS: '#24408c', emblem: '#f0c040' },
  hero_healer: { skin: C.skin, skinS: C.skinS, eye: C.eye, head: 'whitehood', hair: '#c06040', hood: '#f4f4f0', hoodS: '#c0c4cc', trim: '#30b070', body: 'robe', tunic: '#f4f4f0', tunicS: '#c0c4cc', belt: '#30b070', boot: '#8a6a40', weapon: 'rod', orb: '#60f0a0' },

  hero_lancer:   { skin: C.skin, skinS: C.skinS, eye: C.eye, head: 'helmet', metal: '#e0c050', metalS: '#a08020', plume: '#3060e0', body: 'tunic', tunic: '#c03838', tunicS: '#802020', belt: '#e0c050', pants: '#504040', boot: C.boot, weapon: 'spear' },
  hero_thief:    { skin: C.skin, skinS: C.skinS, eye: C.eye, head: 'bandana', hair: '#302838', band: '#d03040', bandS: '#902028', body: 'tunic', tunic: '#3c3c50', tunicS: '#24243a', belt: '#a07030', pants: '#2c2c3c', boot: '#201820', weapon: 'dagger', scarf: '#d03040' },
  hero_warder: { skin: C.skin, skinS: C.skinS, eye: C.eye, head: 'whitehood', hair: '#506080', hood: '#3a78d0', hoodS: '#24508c', trim: '#c8e8ff', body: 'robe', tunic: '#2c5aa8', tunicS: '#1c3c78', belt: '#c8e8ff', boot: '#3a4060', weapon: 'staff', orb: '#80e8ff' },
  hero_enchanter:{ skin: C.skin, skinS: C.skinS, eye: C.eye, head: 'circlet', hair: '#f090c0', hairS: '#c06090', circlet: '#f0c040', gem: '#ff4060', body: 'robe', tunic: '#f0a830', tunicS: '#b87010', belt: '#ffffff', boot: '#8a5a2c', weapon: 'rod', orb: '#ffd040' },
  hero_summoner: { skin: C.skin, skinS: C.skinS, eye: C.eye, head: 'hood', hair: '#40d0d0', hood: '#7a2a8a', hoodS: '#4c1458', body: 'robe', tunic: '#7a2a8a', tunicS: '#4c1458', belt: '#40d0d0', boot: '#302040', weapon: 'staff', orb: '#40d0ff' },
  hero_dragon:   { custom: 'dragon', body: '#3a70d0', bodyS: '#204090', belly: '#a0e0ff', wing: '#5a9ae8', wingS: '#203a80', eye: '#ffe040', horn: '#f0f0ff' },

  mon_sword:   { skin: '#6cc048', skinS: '#3c7c28', eye: '#ff3020', head: 'goblin', body: 'tunic', tunic: '#7a5430', tunicS: '#523618', belt: '#3a2a1a', pants: '#6cc048', boot: '#3a2a1a', weapon: 'cleaver', bare: true },
  mon_mage:    { skin: '#ece4cc', skinS: '#a89c80', eye: '#ff2040', head: 'skull', hood: '#4a2a6a', hoodS: '#2a1440', body: 'robe', tunic: '#4a2a6a', tunicS: '#2a1440', belt: '#a02040', boot: '#ece4cc', weapon: 'staff', orb: '#c040ff' },
  mon_archer:  { skin: '#40b0a0', skinS: '#207060', eye: '#ffe040', head: 'lizard', spine: '#f08030', body: 'tunic', tunic: '#8a6a40', tunicS: '#5a4024', belt: '#3a2a1a', pants: '#40b0a0', boot: '#207060', weapon: 'bow', tail: true, bare: true },
  mon_shield:  { skin: '#8c9a58', skinS: '#5a6430', eye: '#ff4020', head: 'orc', metal: '#6a6a78', metalS: '#44444c', horn: '#ece4cc', body: 'tunic', tunic: '#5a5a66', tunicS: '#3a3a44', belt: '#7a3020', pants: '#4a3a2a', boot: '#2a2228', weapon: 'shield', shield: '#8a5a2c', shieldS: '#5c3a1c', emblem: '#c03030', round: true, bare: true },
  mon_lich:    { skin: '#e8f0d8', skinS: '#a0b090', eye: '#40ff90', head: 'lich', hood: '#203a30', hoodS: '#10241c', crown: '#f0c040', body: 'robe', tunic: '#203a30', tunicS: '#10241c', belt: '#40ff90', boot: '#e8f0d8', weapon: 'staff', orb: '#40ff90' },
  mon_skeleton:{ skin: '#ece4cc', skinS: '#a89c80', eye: '#ff3020', head: 'bones', body: 'tunic', tunic: '#ece4cc', tunicS: '#a89c80', belt: '#5a4a3a', pants: '#ece4cc', boot: '#a89c80', weapon: 'sword', bare: true, ribs: '#5a5040' },
  mon_bat:     { custom: 'bat', body: '#4a3a6a', bodyS: '#2c2244', wing: '#6a4a9a', wingS: '#3a2a5a', eye: '#ffe040', fang: '#ffffff' },
  mon_slime:   { custom: 'slime', body: '#8ad040', bodyS: '#4c8a20', light: '#d8f8a0', eye: '#20142a', drip: '#b060e0' },
  mon_golem:   { custom: 'golem', stone: '#8a8a7a', stoneS: '#5a5a4e', stoneL: '#b4b4a2', moss: '#5a8a3a', eye: '#40e0ff' },
  mon_dragon:  { custom: 'dragon', body: '#d04030', bodyS: '#902018', belly: '#f0c060', wing: '#b03848', wingS: '#601828', eye: '#ffe040', horn: '#f0e0c0' },
  mon_warder:  { skin: '#5a78e0', skinS: '#3448a0', eye: '#ffe040', head: 'goblin', body: 'robe', tunic: '#7a2a5a', tunicS: '#4c1438', belt: '#ff60c0', boot: '#3448a0', weapon: 'staff', orb: '#ff60e0' },
  mon_healer:  { skin: '#f0dcc0', skinS: '#c0a080', eye: '#20142a', head: 'mushroom', cap: '#d83838', capS: '#982020', body: 'robe', tunic: '#80b848', tunicS: '#507828', belt: '#f0dcc0', boot: '#c0a080', weapon: 'rod', orb: '#ff90e0' },
};

// ---------------- bosses: 10 bodies x 5 element palettes ----------------
const BOSS_PAL = {
  fire:    { m: '#d83a20', s: '#8a1c10', l: '#ffb040', a: '#ffe060', e: '#fff060', d: '#3a1410' },
  ice:     { m: '#5ab0e8', s: '#2a6aa8', l: '#d0f0ff', a: '#ffffff', e: '#40ffff', d: '#1a2c48' },
  thunder: { m: '#e8c020', s: '#9a7a10', l: '#fff080', a: '#7090ff', e: '#ffffff', d: '#2c2a40' },
  dark:    { m: '#6a2a9a', s: '#36124e', l: '#b070f0', a: '#ff40a0', e: '#ff3040', d: '#1a0c24' },
  holy:    { m: '#f0ece0', s: '#b8b0a0', l: '#ffffff', a: '#f0c040', e: '#40c0ff', d: '#6a6050' },
};
const BOSS_BODY = {
  goblin:   (c) => ({ skin: c.m, skinS: c.s, eye: c.e, head: 'goblin', body: 'tunic', tunic: c.d, tunicS: '#100810', belt: c.a, pants: c.s, boot: c.d, weapon: 'cleaver', bare: true }),
  orc:      (c) => ({ skin: c.l, skinS: c.s, eye: c.e, head: 'orc', metal: c.s, metalS: c.d, horn: c.a, body: 'tunic', tunic: c.m, tunicS: c.s, belt: c.a, pants: c.d, boot: c.d, weapon: 'shield', shield: c.m, shieldS: c.s, emblem: c.a, round: true, bare: true }),
  lizard:   (c) => ({ skin: c.m, skinS: c.s, eye: c.e, head: 'lizard', spine: c.a, body: 'tunic', tunic: c.d, tunicS: '#100810', belt: c.a, pants: c.m, boot: c.s, weapon: 'bow', tail: true, bare: true }),
  slime:    (c) => ({ custom: 'slime', body: c.m, bodyS: c.s, light: c.l, eye: '#20142a', drip: c.a }),
  golem:    (c) => ({ custom: 'golem', stone: c.m, stoneS: c.s, stoneL: c.l, moss: c.a, eye: c.e }),
  bat:      (c) => ({ custom: 'bat', body: c.s, bodyS: c.d, wing: c.m, wingS: c.s, eye: c.e, fang: '#ffffff' }),
  skeleton: (c) => ({ skin: c.l, skinS: c.s, eye: c.e, head: 'bones', body: 'tunic', tunic: c.l, tunicS: c.s, belt: c.a, pants: c.l, boot: c.s, weapon: 'sword', bare: true, ribs: c.d }),
  mushroom: (c) => ({ skin: '#f0dcc0', skinS: '#c0a080', eye: '#20142a', head: 'mushroom', cap: c.m, capS: c.s, body: 'robe', tunic: c.d, tunicS: '#100810', belt: c.a, boot: '#c0a080', weapon: 'rod', orb: c.a }),
  dragon:   (c) => ({ custom: 'dragon', body: c.m, bodyS: c.s, belly: c.l, wing: c.s, wingS: c.d, eye: c.e, horn: c.a }),
  lich:     (c) => ({ skin: c.l, skinS: c.s, eye: c.e, head: 'lich', hood: c.m, hoodS: c.s, crown: c.a, body: 'robe', tunic: c.m, tunicS: c.s, belt: c.a, boot: c.d, weapon: 'staff', orb: c.e }),
};
for (const b of BOSSES) CHARS['mon_' + b.type] = BOSS_BODY[b.body](BOSS_PAL[b.element]);
export const BOSS_GLOW = Object.fromEntries(Object.entries(BOSS_PAL).map(([k, c]) => [k, k === 'holy' ? c.a : c.m]));

// ---------------- weapon designs (every weapon looks different and shows on the character) ----------------
// shape: blade = sword | axe | great ; bow = short | long ; spear = spear | halberd | lance ; staff = orb | crystal | ring | star
export const WEAPON_LOOK = {
  bronze_sword:   { shape: 'sword', blade: '#d89a50', bladeL: '#f4c890', hilt: '#8a5a2c' },
  iron_axe:       { shape: 'axe',   blade: '#a8b0bc', bladeL: '#e8ecf0', hilt: '#6a4424', shaft: '#8a5a2c' },
  mythril_sword:  { shape: 'sword', blade: '#90d8f0', bladeL: '#ffffff', hilt: '#3060c0', long: true },
  flame_blade:    { shape: 'great', blade: '#ff6030', bladeL: '#ffe080', hilt: '#801818', glow: '#ffb030' },
  short_bow:      { shape: 'short', wood: '#a06a34', string: '#e8e8e8' },
  long_bow:       { shape: 'long',  wood: '#5c3a1c', string: '#f0f0f0' },
  elven_bow:      { shape: 'long',  wood: '#3ca050', string: '#fff8c0', tip: '#f0d040' },
  dragon_bow:     { shape: 'long',  wood: '#b02828', string: '#ffd060', tip: '#ffe040', glow: '#ff8030' },
  bronze_spear:   { shape: 'spear',   shaft: '#8a5a2c', head: '#d89a50', headL: '#f4c890', tassel: '#d03030' },
  halberd:        { shape: 'halberd', shaft: '#6a4424', head: '#a8b0bc', headL: '#e8ecf0', tassel: '#3060e0' },
  mythril_lance:  { shape: 'lance',   shaft: '#c8d0dc', head: '#90d8f0', headL: '#ffffff', tassel: '#3060c0' },
  dragon_lance:   { shape: 'lance',   shaft: '#801818', head: '#ff6030', headL: '#ffe080', tassel: '#f0c040', glow: '#ffb030' },
  oak_staff:      { shape: 'orb',     shaft: '#8a5a2c', orb: '#70e070' },
  crystal_rod:    { shape: 'crystal', shaft: '#c8d0dc', orb: '#80e0ff' },
  sage_staff:     { shape: 'ring',    shaft: '#f0c040', orb: '#ffffff' },
  archmage_staff: { shape: 'star',    shaft: '#4a2a7a', orb: '#e070ff', glow: '#ffe0ff' },
};
const WEAPON_POSE = { blade: 'sword', bow: 'bow', spear: 'spear', staff: 'staff' };
// The character config with an equipped weapon drawn in its hand. The tank keeps its shield and carries
// a blade on its back hand.
function withWeapon(k, weaponId) {
  const it = ITEMS[weaponId], look = WEAPON_LOOK[weaponId];
  if (!it || !look || k.custom) return k;
  if (k.weapon === 'shield') return { ...k, backBlade: look };
  return { ...k, weapon: WEAPON_POSE[it.kind], look };
}
function drawBackBlade(p, L, by) {
  // blade held behind the body (from the back hand, pointing up and back)
  const x = 8, y = 16 + by;
  if (L.shape === 'axe') {
    p.line(x, y, x - 4, y - 6, L.shaft || C.wood); p.rect(x - 6, y - 8, 3, 3, L.blade); p.set(x - 6, y - 8, L.bladeL);
  } else {
    const n = L.shape === 'great' ? 8 : L.long ? 7 : 6;
    p.line(x - 1, y - 1, x - 1 - Math.round(n * 0.6), y - 1 - n, L.blade); p.line(x, y - 1, x - Math.round(n * 0.6), y - 1 - n, L.bladeL);
    p.set(x, y, L.hilt); p.set(x + 1, y - 1, L.hilt);
    if (L.glow) p.set(x - 1 - Math.round(n * 0.6), y - 2 - n, '*' + L.glow);
  }
}

function drawHead(p, k, by) {
  const y0 = 5 + by;
  // base head + face
  const skinHead = () => { p.rect(8, y0, 7, 7, k.skin); p.rect(8, y0 + 5, 2, 2, k.skinS); };
  const eyes = (x = 13, y = y0 + 3) => { p.set(x, y, k.eye); p.set(x, y + 1, k.eye); };
  switch (k.head) {
    case 'spiky':
      skinHead();
      p.rect(8, y0 - 1, 7, 3, k.hair); p.rect(7, y0, 3, 6, k.hair); p.rect(8, y0 + 2, 2, 4, k.hairS);
      p.set(9, y0 - 2, k.hair); p.set(11, y0 - 2, k.hair); p.set(13, y0 - 2, k.hair); p.set(10, y0 - 3, k.hair);
      p.set(14, y0 + 2, k.hair); p.set(6, y0 + 1, k.hair);
      eyes(); break;
    case 'wizard':
      skinHead();
      p.rect(7, y0 + 2, 3, 4, k.hair); p.rect(7, y0 + 4, 2, 2, k.hairS);
      p.rect(6, y0 + 1, 11, 1, k.hat); p.rect(8, y0 - 2, 6, 3, k.hat); p.rect(9, y0 - 3, 4, 1, k.hat);
      p.rect(8, y0 - 4, 3, 1, k.hat); p.set(7, y0 - 5, k.hat); p.set(6, y0 - 5, k.hatS);
      p.rect(8, y0, 6, 1, k.belt); p.rect(6, y0 + 1, 2, 1, k.hatS);
      eyes(13, y0 + 3); break;
    case 'hood':
      skinHead();
      p.rect(8, y0 - 1, 7, 3, k.hood); p.rect(7, y0, 3, 8, k.hood); p.rect(7, y0 + 4, 2, 4, k.hoodS);
      p.set(6, y0 + 1, k.hood); p.set(5, y0 + 2, k.hoodS);
      p.set(14, y0 + 2, k.hood); p.rect(11, y0 + 2, 2, 1, k.hair);
      eyes(); break;
    case 'helmet':
      skinHead();
      p.rect(8, y0 - 1, 7, 4, k.metal); p.rect(7, y0, 2, 7, k.metal); p.rect(7, y0 + 3, 2, 4, k.metalS);
      p.rect(10, y0 + 2, 5, 1, k.metalS); p.rect(14, y0 + 3, 1, 3, k.metal);
      p.rect(10, y0 - 3, 3, 2, k.plume); p.set(9, y0 - 2, k.plume); p.set(8, y0 - 2, k.plume);
      eyes(12, y0 + 3); break;
    case 'whitehood':
      skinHead();
      p.rect(8, y0 - 1, 7, 3, k.hood); p.rect(7, y0, 3, 8, k.hood); p.rect(7, y0 + 4, 2, 4, k.hoodS);
      p.rect(10, y0 + 2, 5, 1, k.trim); p.rect(10, y0 + 2, 1, 5, k.trim);
      p.set(12, y0 - 2, k.hood); p.rect(11, y0 + 3, 2, 1, k.hair);
      eyes(); break;
    case 'bandana':
      skinHead();
      p.rect(7, y0, 3, 5, k.hair); p.rect(8, y0 - 1, 7, 2, k.band); p.rect(8, y0 + 1, 7, 1, k.bandS);
      p.set(6, y0, k.band); p.set(5, y0 + 1, k.band); p.set(5, y0 + 2, k.bandS); // knot tails
      p.rect(11, y0 + 5, 4, 2, k.scarf); // face mask
      eyes(13, y0 + 3); break;
    case 'circlet':
      skinHead();
      p.rect(7, y0 - 1, 8, 3, k.hair); p.rect(6, y0 + 1, 4, 8, k.hair); p.rect(6, y0 + 5, 2, 4, k.hairS);
      p.rect(9, y0 + 1, 6, 1, k.circlet); p.set(13, y0 + 1, '*' + k.gem);
      eyes(13, y0 + 3); break;
    case 'goblin':
      skinHead();
      p.set(7, y0 + 2, k.skin); p.set(6, y0 + 1, k.skin); p.set(5, y0, k.skinS); p.set(7, y0 + 3, k.skinS); // ear
      p.rect(8, y0, 7, 1, k.skinS);
      p.set(15, y0 + 4, k.skin); p.set(15, y0 + 5, k.skinS); // nose
      p.set(13, y0 + 6, C.white); p.set(11, y0 + 6, C.white);
      p.rect(9, y0 - 1, 4, 1, '#7a5430'); // cap
      eyes(13, y0 + 3); break;
    case 'skull':
      p.rect(8, y0, 7, 7, k.skin); p.rect(8, y0 + 5, 2, 2, k.skinS);
      p.rect(12, y0 + 2, 2, 2, '#20142a'); p.set(13, y0 + 3, k.eye);
      p.set(14, y0 + 5, '#20142a'); p.rect(11, y0 + 6, 4, 1, k.skinS); p.set(12, y0 + 6, k.skin); p.set(14, y0 + 6, k.skin);
      p.rect(8, y0 - 2, 6, 3, k.hood); p.rect(7, y0 - 1, 3, 9, k.hood); p.rect(7, y0 + 4, 2, 4, k.hoodS);
      p.set(13, y0 - 3, k.hood); p.set(14, y0 - 1, k.hood);
      break;
    case 'lizard':
      skinHead();
      p.rect(14, y0 + 3, 3, 3, k.skin); p.rect(14, y0 + 5, 3, 1, k.skinS); p.set(16, y0 + 3, k.skinS);
      p.set(7, y0, k.spine); p.set(7, y0 + 2, k.spine); p.set(7, y0 + 4, k.spine); p.set(9, y0 - 1, k.spine); p.set(11, y0 - 1, k.spine);
      p.rect(12, y0 + 2, 2, 2, k.eye); p.set(13, y0 + 3, '#20142a');
      break;
    case 'lich':
      p.rect(8, y0, 7, 7, k.skin); p.rect(8, y0 + 5, 2, 2, k.skinS);
      p.rect(12, y0 + 2, 2, 2, '#20142a'); p.set(13, y0 + 3, '*' + k.eye);
      p.set(14, y0 + 5, '#20142a'); p.rect(11, y0 + 6, 4, 1, k.skinS);
      p.rect(7, y0 - 1, 3, 9, k.hood); p.rect(7, y0 + 4, 2, 4, k.hoodS); p.rect(8, y0 - 1, 6, 1, k.hood);
      p.rect(9, y0 - 3, 6, 2, k.crown); p.set(9, y0 - 4, k.crown); p.set(12, y0 - 4, k.crown); p.set(14, y0 - 4, k.crown); p.set(11, y0 - 2, '*#40ff90');
      break;
    case 'bones':
      p.rect(8, y0, 7, 6, k.skin); p.rect(9, y0 + 6, 5, 1, k.skin); p.rect(8, y0 + 4, 2, 2, k.skinS);
      p.rect(12, y0 + 2, 2, 2, '#20142a'); p.set(13, y0 + 3, k.eye); p.set(14, y0 + 4, '#20142a');
      p.set(11, y0 + 6, '#20142a'); p.set(13, y0 + 6, '#20142a');
      break;
    case 'orc':
      p.rect(8, y0, 7, 7, k.skin); p.rect(8, y0 + 5, 2, 2, k.skinS);
      p.rect(8, y0 - 1, 7, 3, k.metal); p.rect(7, y0, 2, 5, k.metal); p.rect(7, y0 + 2, 2, 3, k.metalS);
      p.set(8, y0 - 2, k.horn); p.set(7, y0 - 3, k.horn); p.set(14, y0 - 2, k.horn); p.set(15, y0 - 3, k.horn);
      p.set(14, y0 + 5, k.horn); p.set(14, y0 + 4, k.horn); p.set(12, y0 + 5, k.horn);
      p.rect(12, y0 + 3, 2, 1, k.eye);
      break;
    case 'mushroom':
      p.rect(9, y0 + 2, 6, 5, k.skin); p.rect(9, y0 + 5, 2, 2, k.skinS);
      p.rect(6, y0 - 1, 12, 3, k.cap); p.rect(7, y0 - 3, 10, 2, k.cap); p.rect(9, y0 - 4, 6, 1, k.cap);
      p.rect(6, y0 + 1, 12, 1, k.capS);
      p.set(9, y0 - 2, C.white); p.set(13, y0 - 3, C.white); p.rect(15, y0 - 1, 2, 1, C.white); p.set(11, y0, C.white);
      eyes(13, y0 + 3);
      break;
  }
}

function drawLegs(p, k, pose) {
  const legC = k.pants || k.tunicS;
  let back = 9, front = 12;
  if (pose === 'walk1') { back = 8; front = 13; }
  if (pose === 'walk2') { back = 10; front = 11; }
  if (pose === 'atk2') { back = 8; front = 13; }
  if (k.body === 'robe') {
    p.rect(back, 20, 2, 2, k.boot); p.rect(front, 20, 3, 2, k.boot);
    return;
  }
  p.rect(back, 18, 2, 3, legC); p.rect(back, 21, 2, 1, k.boot);
  p.rect(front, 18, 2, 3, legC); p.rect(front, 21, 3, 1, k.boot);
  if (!k.bare) { p.set(back, 20, k.boot); p.set(front, 20, k.boot); }
}

function drawBody(p, k, by) {
  if (k.tail) { p.rect(5, 17, 4, 2, k.skin); p.set(4, 18, k.skinS); p.set(5, 18, k.skinS); }
  if (k.body === 'robe') {
    const rows = [[9, 5], [9, 5], [8, 7], [8, 7], [7, 9], [7, 9], [7, 9], [7, 9]];
    rows.forEach(([x, w], i) => {
      p.rect(x, 13 + by + i, w, 1, k.tunic);
      p.rect(x, 13 + by + i, 2, 1, k.tunicS);
    });
    p.rect(9, 15 + by, 5, 1, k.belt);
    p.rect(12, 16 + by, 1, 4 - by, k.belt);
  } else {
    p.rect(9, 12 + by, 5, 6, k.tunic);
    p.rect(9, 12 + by, 1, 6, k.tunicS);
    p.rect(9, 16 + by, 5, 1, k.belt);
    if (k.ribs) { p.rect(10, 13 + by, 3, 1, k.ribs); p.rect(10, 15 + by, 3, 1, k.ribs); }
  }
  // back arm
  p.rect(8, 13 + by, 1, 3, k.tunicS); p.set(8, 16 + by, k.bare ? k.skinS : k.skinS);
}

function handPos(pose, by) {
  switch (pose) {
    case 'walk1': return [14, 16 + by];
    case 'walk2': return [12, 16 + by];
    case 'atk1': return [11, 11 + by];
    case 'atk2': return [16, 14 + by];
    default: return [13, 16 + by];
  }
}

function drawArm(p, k, pose, by) {
  const [hx, hy] = handPos(pose, by);
  const sleeve = k.bare ? k.skin : k.tunic;
  if (pose === 'atk2') { p.rect(12, 14 + by, 4, 1, sleeve); }
  else if (pose === 'atk1') { p.rect(11, 12 + by, 2, 2, sleeve); }
  else { p.rect(12, 13 + by, 2, 2, sleeve); p.set(hx, hy - 1, sleeve); }
  p.set(hx, hy, k.skin);
  return [hx, hy];
}

function drawWeapon(p, k, pose, hx, hy) {
  switch (k.weapon) {
    case 'sword':
      if (k.look) { drawBlade(p, k.look, pose, hx, hy); break; }
      // falls through to the default sword
    case 'cleaver': {
      const blade = k.weapon === 'sword' ? C.steel : '#9a9a9a';
      const bladeS = k.weapon === 'sword' ? '#ffffff' : '#6a6a6a';
      if (pose === 'atk1') { p.line(hx - 1, hy - 1, hx - 4, hy - 6, blade); p.line(hx, hy - 2, hx - 3, hy - 7, bladeS); p.set(hx + 1, hy, C.gold); p.set(hx - 1, hy + 1, C.gold); }
      else if (pose === 'atk2') { p.rect(hx + 1, hy, 6, 1, blade); p.rect(hx + 1, hy - 1, 5, 1, bladeS); p.set(hx + 1, hy - 1, C.gold); p.set(hx + 1, hy + 1, C.gold); if (k.weapon === 'cleaver') p.rect(hx + 3, hy + 1, 4, 1, blade); }
      else { p.line(hx + 1, hy - 1, hx + 5, hy - 5, blade); p.line(hx + 2, hy - 1, hx + 5, hy - 4, bladeS); p.set(hx, hy - 1, C.gold); p.set(hx + 1, hy, C.gold); if (k.weapon === 'cleaver') { p.set(hx + 4, hy - 3, blade); p.set(hx + 5, hy - 3, blade); } }
      break;
    }
    case 'dagger': {
      if (pose === 'atk1') { p.line(hx - 1, hy - 1, hx - 3, hy - 4, C.steel); p.set(hx, hy, C.gold); }
      else if (pose === 'atk2') { p.rect(hx + 1, hy, 4, 1, C.steel); p.set(hx + 4, hy - 1, '#ffffff'); p.set(hx + 1, hy - 1, C.gold); p.set(hx + 1, hy + 1, C.gold); }
      else { p.line(hx + 1, hy - 1, hx + 3, hy - 3, C.steel); p.set(hx, hy - 1, C.gold); }
      break;
    }
    case 'spear': {
      if (k.look) { drawSpear(p, k.look, pose, hx, hy); break; }
      if (pose === 'atk1') { // pulled back, level, ready to charge
        p.rect(hx - 8, hy, 14, 1, C.wood); p.rect(hx + 6, hy - 1, 2, 3, C.steel); p.set(hx + 8, hy, '#ffffff');
      } else if (pose === 'atk2') { // thrust
        p.rect(hx - 4, hy, 12, 1, C.wood); p.rect(hx + 8, hy - 1, 3, 3, C.steel); p.set(hx + 11, hy, '#ffffff'); p.set(hx + 1, hy - 1, '#3060e0');
      } else { // upright
        p.line(hx, hy + 5, hx, hy - 10, C.wood); p.rect(hx - 1, hy - 13, 3, 3, C.steel); p.set(hx, hy - 14, '#ffffff'); p.set(hx + 1, hy - 9, '#3060e0');
      }
      break;
    }
    case 'staff':
    case 'rod': {
      if (k.look) { drawStaff(p, k.look, pose, hx, hy); break; }
      const orb = '*' + k.orb;
      if (pose === 'atk2') { p.line(hx - 2, hy + 3, hx + 3, hy - 4, C.wood); p.rect(hx + 3, hy - 6, 2, 2, orb); p.set(hx + 5, hy - 7, '*#ffffff'); p.set(hx + 6, hy - 5, '*#ffffff'); }
      else if (pose === 'atk1') { p.line(hx, hy + 3, hx, hy - 7, C.wood); p.rect(hx - 1, hy - 9, 2, 2, orb); }
      else { p.line(hx, hy + 4, hx, hy - 6, C.wood); p.rect(hx - (k.weapon === 'rod' ? 0 : 1), hy - 8, 2, 2, orb); if (k.weapon === 'rod') { p.set(hx - 1, hy - 7, C.gold); p.set(hx + 2, hy - 7, C.gold); } }
      break;
    }
    case 'bow': {
      if (k.look) { drawBow(p, k.look, pose, hx, hy); break; }
      // bow held forward
      const bx = pose === 'atk1' || pose === 'atk2' ? 16 : hx + 1, byy = pose === 'atk1' || pose === 'atk2' ? 14 : hy - 1;
      p.set(bx - 1, byy - 4, C.wood); p.set(bx, byy - 3, C.wood); p.rect(bx + 1, byy - 2, 1, 5, C.wood); p.set(bx, byy + 3, C.wood); p.set(bx - 1, byy + 4, C.wood);
      if (pose === 'atk1') { p.line(bx - 1, byy - 4, 11, byy, '#e8e8e8'); p.line(11, byy, bx - 1, byy + 4, '#e8e8e8'); p.rect(11, byy, 8, 1, C.woodS); p.set(19, byy, C.steel); }
      else { p.line(bx - 1, byy - 4, bx - 1, byy + 4, '#e8e8e8'); }
      break;
    }
    case 'shield': {
      const sx = pose === 'atk2' ? 15 : pose === 'atk1' ? 12 : 13, sy = 11;
      if (k.round) {
        p.rect(sx, sy + 1, 5, 7, k.shield); p.rect(sx + 1, sy, 3, 9, k.shield); p.rect(sx, sy + 1, 1, 7, k.shieldS);
        p.rect(sx + 2, sy + 3, 2, 3, k.emblem); p.set(sx + 2, sy + 4, C.steel);
      } else {
        p.rect(sx, sy, 5, 8, k.shield); p.rect(sx + 1, sy + 8, 3, 1, k.shield); p.set(sx + 2, sy + 9, k.shield);
        p.rect(sx, sy, 1, 8, k.shieldS); p.rect(sx, sy, 5, 1, C.steel);
        p.rect(sx + 2, sy + 2, 1, 5, k.emblem); p.rect(sx + 1, sy + 3, 3, 1, k.emblem);
      }
      break;
    }
  }
}

// ---- equipped weapon designs ----
function drawBlade(p, L, pose, hx, hy) {
  const glow = L.glow ? '*' + L.glow : null;
  if (L.shape === 'axe') {
    const sh = L.shaft || C.wood;
    if (pose === 'atk1') { p.line(hx, hy, hx - 3, hy - 6, sh); p.rect(hx - 6, hy - 9, 3, 4, L.blade); p.rect(hx - 6, hy - 9, 1, 4, L.bladeL); }
    else if (pose === 'atk2') { p.rect(hx + 1, hy, 6, 1, sh); p.rect(hx + 6, hy - 2, 3, 5, L.blade); p.rect(hx + 8, hy - 2, 1, 5, L.bladeL); }
    else { p.line(hx, hy, hx + 4, hy - 5, sh); p.rect(hx + 4, hy - 8, 3, 4, L.blade); p.rect(hx + 6, hy - 8, 1, 4, L.bladeL); }
    return;
  }
  const n = L.shape === 'great' ? 8 : L.long ? 7 : 5;   // blade length
  if (pose === 'atk1') {
    p.line(hx - 1, hy - 1, hx - 1 - Math.round(n * 0.6), hy - 1 - n, L.blade); p.line(hx, hy - 2, hx - Math.round(n * 0.6), hy - 2 - n, L.bladeL);
    p.set(hx + 1, hy, L.hilt); p.set(hx - 1, hy + 1, L.hilt);
    if (glow) p.set(hx - 1 - Math.round(n * 0.6), hy - 2 - n, glow);
  } else if (pose === 'atk2') {
    p.rect(hx + 1, hy, n + 1, 1, L.blade); p.rect(hx + 1, hy - 1, n, 1, L.bladeL);
    if (L.shape === 'great') p.rect(hx + 2, hy + 1, n - 1, 1, L.blade);
    p.set(hx + 1, hy - 1, L.hilt); p.set(hx + 1, hy + 1, L.hilt);
    if (glow) { p.set(hx + n + 2, hy, glow); p.set(hx + n + 1, hy - 2, glow); }
  } else {
    p.line(hx + 1, hy - 1, hx + n, hy - n, L.blade); p.line(hx + 2, hy - 1, hx + n, hy - n + 1, L.bladeL);
    if (L.shape === 'great') p.line(hx + 1, hy - 2, hx + n - 1, hy - n, L.blade);
    p.set(hx, hy - 1, L.hilt); p.set(hx + 1, hy, L.hilt);
    if (glow) { p.set(hx + n + 1, hy - n - 1, glow); p.set(hx + n - 1, hy - n - 2, glow); }
  }
}
function drawBow(p, L, pose, hx, hy) {
  const drawn = pose === 'atk1' || pose === 'atk2';
  const bx = drawn ? 16 : hx + 1, by = drawn ? 14 : hy - 1, h = L.shape === 'long' ? 6 : 4;
  // limbs
  p.set(bx - 1, by - h, L.wood); p.line(bx, by - h + 1, bx + 1, by - 2, L.wood); p.rect(bx + 1, by - 2, 1, 5, L.wood);
  p.line(bx + 1, by + 2, bx, by + h - 1, L.wood); p.set(bx - 1, by + h, L.wood);
  if (L.tip) { p.set(bx - 1, by - h, L.tip); p.set(bx - 1, by + h, L.tip); }
  if (L.glow) p.set(bx + 2, by, '*' + L.glow);
  if (pose === 'atk1') {
    p.line(bx - 1, by - h, 11, by, L.string); p.line(11, by, bx - 1, by + h, L.string);
    p.rect(11, by, 8, 1, C.woodS); p.set(19, by, L.glow ? '*' + L.glow : C.steel);
  } else p.line(bx - 1, by - h, bx - 1, by + h, L.string);
}
function drawSpear(p, L, pose, hx, hy) {
  const glow = L.glow ? '*' + L.glow : null;
  const tip = (x, y, dir) => {   // dir: 'up' or 'right'
    if (L.shape === 'lance') {
      if (dir === 'up') { p.rect(x - 1, y - 2, 3, 3, L.head); p.rect(x, y - 5, 1, 3, L.head); p.set(x, y - 6, L.headL); p.set(x - 1, y - 2, L.headL); }
      else { p.rect(x, y - 1, 3, 3, L.head); p.rect(x + 3, y, 3, 1, L.head); p.set(x + 6, y, L.headL); p.set(x, y - 1, L.headL); }
    } else if (L.shape === 'halberd') {
      if (dir === 'up') { p.rect(x - 1, y - 3, 3, 3, L.head); p.set(x, y - 4, L.headL); p.rect(x + 2, y - 3, 2, 4, L.head); p.rect(x + 3, y - 3, 1, 4, L.headL); }
      else { p.rect(x, y - 1, 3, 3, L.head); p.set(x + 3, y, L.headL); p.rect(x, y + 2, 4, 2, L.head); p.rect(x, y + 3, 4, 1, L.headL); }
    } else {
      if (dir === 'up') { p.rect(x - 1, y - 3, 3, 3, L.head); p.set(x, y - 4, L.headL); }
      else { p.rect(x, y - 1, 3, 3, L.head); p.set(x + 3, y, L.headL); }
    }
    if (glow) { if (dir === 'up') p.set(x + 1, y - 6, glow); else p.set(x + 6, y - 1, glow); }
  };
  if (pose === 'atk1') { p.rect(hx - 8, hy, 14, 1, L.shaft); tip(hx + 6, hy, 'right'); p.set(hx + 4, hy + 1, L.tassel); }
  else if (pose === 'atk2') { p.rect(hx - 4, hy, 12, 1, L.shaft); tip(hx + 8, hy, 'right'); p.set(hx + 6, hy + 1, L.tassel); }
  else { p.line(hx, hy + 5, hx, hy - 10, L.shaft); tip(hx, hy - 10, 'up'); p.set(hx + 1, hy - 9, L.tassel); p.set(hx + 1, hy - 8, L.tassel); }
}
function drawStaff(p, L, pose, hx, hy) {
  const orb = '*' + L.orb;
  // shaft and the top position for each pose
  let tx, ty;
  if (pose === 'atk2') { p.line(hx - 2, hy + 3, hx + 3, hy - 4, L.shaft); tx = hx + 4; ty = hy - 6; }
  else if (pose === 'atk1') { p.line(hx, hy + 3, hx, hy - 7, L.shaft); tx = hx; ty = hy - 9; }
  else { p.line(hx, hy + 4, hx, hy - 6, L.shaft); tx = hx; ty = hy - 8; }
  switch (L.shape) {
    case 'crystal':   // tall diamond
      p.set(tx, ty - 2, orb); p.rect(tx - 1, ty - 1, 3, 2, orb); p.set(tx, ty + 1, orb); p.set(tx, ty - 1, '*#ffffff'); break;
    case 'ring':      // golden ring around a white orb
      p.rect(tx - 1, ty - 1, 3, 1, L.shaft); p.rect(tx - 1, ty + 1, 3, 1, L.shaft); p.set(tx - 2, ty, L.shaft); p.set(tx + 2, ty, L.shaft); p.set(tx, ty, orb); p.set(tx - 1, ty, orb); p.set(tx + 1, ty, orb); break;
    case 'star':      // glowing star
      p.rect(tx - 1, ty - 1, 3, 3, orb); p.set(tx, ty - 2, orb); p.set(tx, ty + 2, orb); p.set(tx - 2, ty, orb); p.set(tx + 2, ty, orb);
      p.set(tx, ty, '*' + (L.glow || '#ffffff')); p.set(tx + 2, ty - 2, '*' + (L.glow || '#ffffff')); p.set(tx - 2, ty - 2, '*' + (L.glow || '#ffffff')); break;
    default:          // simple orb
      p.rect(tx - 1, ty - 1, 2, 2, orb); p.set(tx - 1, ty - 1, '*#ffffff');
  }
  if (pose === 'atk2') { p.set(tx + 2, ty - 2, '*#ffffff'); p.set(tx + 3, ty, '*#ffffff'); }
}

// ---------------- non-humanoid monsters ----------------
const CUSTOM = {
  slime(p, k, pose) {
    const cfg = { idle: [14, 9, 0, 0], walk1: [16, 7, 0, 0], walk2: [12, 11, 0, -1], atk1: [15, 8, -2, 0], atk2: [17, 9, 3, 0] }[pose];
    const [w, h, dx, lift] = cfg;
    const cx = 12 + dx, base = 21 + lift;
    for (let j = 0; j < h; j++) {
      const hw = Math.round((w / 2) * Math.sqrt(1 - Math.pow(j / h, 2)));
      p.rect(cx - hw, base - j, hw * 2, 1, j < 2 ? k.bodyS : k.body);
    }
    p.rect(cx - Math.round(w / 2), base - 1, 2, 2, k.bodyS);
    const top = base - h + 1;
    p.set(cx - 3, top + 2, k.light); p.set(cx - 2, top + 1, k.light); p.set(cx - 4, top + 3, k.light);
    p.rect(cx + 1, top + 3, 1, 2, k.eye); p.rect(cx + 4, top + 3, 1, 2, k.eye);
    p.rect(cx + 2, top + 6, 2, 1, k.bodyS);
    p.set(cx - 5, base - 3, k.drip); p.set(cx + 5, base - 2, k.drip);
    if (pose === 'atk2') { p.set(cx + 9, top + 4, '*' + k.drip); p.set(cx + 10, top + 5, '*' + k.drip); p.set(cx + 11, top + 3, '*' + k.drip); }
  },
  bat(p, k, pose) {
    const off = { idle: [0, 0], walk1: [0, 1], walk2: [0, -1], atk1: [-2, -1], atk2: [4, 3] }[pose];
    const [ox, oy] = off;
    const up = pose === 'idle' || pose === 'walk2' || pose === 'atk1';
    const wing = (pts, c) => p.poly(pts.map(([x, y]) => [x + ox, y + oy]), c);
    if (pose === 'atk2') {
      wing([[11, 11], [2, 7], [5, 12], [9, 13]], k.wingS); wing([[12, 10], [4, 4], [7, 10], [10, 12]], k.wing);
    } else if (up) {
      wing([[15, 10], [21, 3], [20, 9], [17, 12]], k.wingS); wing([[10, 10], [3, 3], [4, 9], [8, 12]], k.wing);
    } else {
      wing([[15, 10], [21, 16], [18, 15], [16, 13]], k.wingS); wing([[10, 10], [3, 16], [6, 15], [9, 13]], k.wing);
    }
    p.ellipse(12 + ox, 11 + oy, 3, 3, k.body); p.rect(10 + ox, 12 + oy, 2, 2, k.bodyS);
    p.set(10 + ox, 7 + oy, k.body); p.set(14 + ox, 7 + oy, k.body); p.set(10 + ox, 8 + oy, k.body); p.set(14 + ox, 8 + oy, k.body);
    p.set(12 + ox, 10 + oy, '*' + k.eye); p.set(14 + ox, 10 + oy, '*' + k.eye);
    p.set(12 + ox, 13 + oy, k.fang); p.set(14 + ox, 13 + oy, k.fang);
    if (pose === 'atk2') { p.set(12 + ox, 14 + oy, k.fang); p.set(14 + ox, 14 + oy, k.fang); }
    p.set(11 + ox, 15 + oy, k.bodyS); p.set(13 + ox, 15 + oy, k.bodyS);
  },
  golem(p, k, pose) {
    // legs
    const lg = { walk1: [7, 14], walk2: [9, 12] }[pose] || [8, 13];
    p.rect(lg[0], 18, 3, 4, k.stoneS); p.rect(lg[1], 18, 3, 4, k.stone);
    // torso
    p.rect(6, 10, 12, 8, k.stone); p.rect(6, 10, 2, 8, k.stoneS); p.rect(8, 10, 9, 1, k.stoneL);
    p.set(11, 13, k.stoneS); p.set(12, 14, k.stoneS); p.set(12, 15, k.stoneS); p.rect(14, 12, 2, 1, k.moss); p.rect(7, 16, 3, 1, k.moss);
    p.set(12, 12, '*' + k.eye);
    // head
    p.rect(9, 5, 7, 5, k.stone); p.rect(9, 5, 7, 1, k.stoneL); p.rect(9, 8, 2, 2, k.stoneS);
    p.rect(12, 7, 3, 1, '*' + k.eye);
    // arms
    if (pose === 'atk1') {
      p.rect(4, 4, 3, 7, k.stoneS); p.rect(15, 3, 3, 8, k.stone); p.rect(14, 0, 5, 3, k.stoneL);
    } else if (pose === 'atk2') {
      p.rect(4, 11, 3, 6, k.stoneS); p.rect(16, 12, 3, 6, k.stone); p.rect(16, 18, 6, 4, k.stoneL);
      p.set(22, 21, '*#d8c8a0'); p.set(23, 19, '*#d8c8a0'); p.set(15, 21, '*#d8c8a0');
    } else {
      const sw = pose === 'walk1' ? 1 : pose === 'walk2' ? -1 : 0;
      p.rect(4, 11 - sw, 3, 6, k.stoneS); p.rect(16, 11 + sw, 3, 6, k.stone); p.rect(16, 17 + sw, 4, 3, k.stoneL);
    }
  },
  dragon(p, k, pose) {
    const step = pose === 'walk1' ? 1 : pose === 'walk2' ? -1 : 0;
    // tail
    p.line(1, 17, 7, 16, k.bodyS); p.line(1, 18, 7, 17, k.body); p.set(0, 16, k.horn);
    // wing (behind)
    if (pose === 'walk1' || pose === 'atk2') p.poly([[9, 13], [4, 9], [6, 13], [8, 15]], k.wingS);
    else p.poly([[9, 13], [5, 3], [8, 6], [12, 6], [14, 12]], k.wing);
    // body + legs
    p.ellipse(11, 16, 5, 3, k.body); p.rect(9, 17, 6, 2, k.belly);
    p.rect(8 + step, 19, 2, 3, k.bodyS); p.rect(13 - step, 19, 2, 3, k.body);
    // neck + head
    let hx = 16, hy = 7;
    if (pose === 'atk1') { hx = 14; hy = 4; }
    if (pose === 'atk2') { hx = 14; hy = 9; }
    p.line(14, 14, hx + 1, hy + 4, k.body); p.line(15, 14, hx + 2, hy + 4, k.body); p.line(13, 14, hx, hy + 4, k.bodyS);
    p.rect(hx, hy, 5, 4, k.body); p.rect(hx + 4, hy + 2, 3, 2, k.body);
    p.set(hx + 3, hy + 1, '*' + k.eye); p.set(hx + 1, hy - 1, k.horn); p.set(hx, hy - 2, k.horn);
    if (pose === 'atk2') {
      p.rect(hx + 4, hy + 4, 3, 1, k.bodyS);
      ['#fff2a0', '#ffb030', '#ff6020'].forEach((c, i) => { p.set(hx + 7 + i, hy + 3, '*' + c); p.set(hx + 7 + i, hy + 4 + (i % 2), '*' + c); });
    } else p.rect(hx + 4, hy + 3, 3, 1, k.bodyS);
  },
};

function drawPose(k, pose) {
  const p = new Pix();
  if (k.custom) { CUSTOM[k.custom](p, k, pose); p.outline(); return p; }
  const by = pose === 'walk2' ? -1 : 0;
  drawLegs(p, k, pose);
  drawBody(p, k, by);
  if (k.backBlade) drawBackBlade(p, k.backBlade, by);
  drawHead(p, k, by);
  const [hx, hy] = (k.weapon === 'shield') ? handPos(pose, by) : drawArm(p, k, pose, by);
  if (k.weapon === 'shield') { p.rect(12, 13 + by, 2, 2, k.bare ? k.skin : k.tunic); }
  drawWeapon(p, k, pose, hx, hy);
  p.outline();
  return p;
}

const cache = {};

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && false) return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// Returns data URL for sprite sheet (FRAMES * 24 x 24)
export function sheet(key) {
  if (cache[key]) return cache[key];
  const [base, weaponId] = key.split('@');
  const k = weaponId ? withWeapon(CHARS[base], weaponId) : CHARS[base];
  const cv = canvas(SIZE * FRAMES, SIZE);
  const ctx = cv.getContext('2d');
  ['idle', 'walk1', 'walk2', 'atk1', 'atk2'].forEach((pose, i) => drawPose(k, pose).draw(ctx, i * SIZE, 0));
  // hurt: idle tinted red
  const tmp = canvas(SIZE, SIZE); const tc = tmp.getContext('2d');
  drawPose(k, 'idle').draw(tc, 0, 0);
  tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = 'rgba(255,60,60,0.55)'; tc.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(tmp, 5 * SIZE - 1, 0);
  // down: idle rotated 90deg, lying on the ground
  const t2 = canvas(SIZE, SIZE); drawPose(k, 'idle').draw(t2.getContext('2d'), 0, 0);
  ctx.save(); ctx.translate(6 * SIZE + SIZE / 2, SIZE / 2 + 7); ctx.rotate(-Math.PI / 2); ctx.drawImage(t2, -SIZE / 2, -SIZE / 2 - 2); ctx.restore();
  cache[key] = cv.toDataURL();
  return cache[key];
}

// weapon: an item key ("mythril_sword+3") — the level doesn't change the look
export function spriteKey(team, type, weapon = null) {
  const id = weapon ? String(weapon).replace(/\+\d+$/, '') : '';
  return (team === 'ally' ? 'hero_' : 'mon_') + type + (id && WEAPON_LOOK[id] ? '@' + id : '');
}

// Small pixel icons (12x12)
const ICONS = {
  coin: ['....kkkk....', '..kkyyyykk..', '.kyyYYYYyyk.', '.kyYyyyyyYk.', 'kyyYyykyyyYk', 'kyyYyykyyyYk', 'kyyYyykyyyYk', 'kyyYyykyyyYk', '.kyYyyyyyYk.', '.kyyYYYYyyk.', '..kkyyyykk..', '....kkkk....'],
  weapon: ['.........kk.', '........kwk.', '.......kwwk.', '......kwwk..', '.....kwwk...', '.kk.kwwk....', '.kykwwk.....', '..kyyk......', '..kbyyk.....', '.kbbkkyk....', 'kbbk..kk....', 'kkk.........'],
  armor: ['............', '.kkk....kkk.', 'kgggkkkkgggk', 'kgwgggggggGk', 'kkgwggggGGkk', '..kgwgggGk..', '..kggwggGk..', '..kgggggGk..', '..kyyyyyyk..', '..kgggggGk..', '..kGGGGGGk..', '...kkkkkk...'],
  accessory: ['....kkkk....', '...kyyyyk...', '..ky....yk..', '..ky....yk..', '...kyyyyk...', '....kkkk....', '....krrk....', '...krwrrk...', '...krrrrk...', '....krrk....', '.....kk.....', '............'],
};
ICONS.soundOn = ['.....kk.....', '....kwk..w..', '...kwwk...w.', 'kkkwwwk.w..w', 'kwwwwwk..w.w', 'kwwwwwk..w.w', 'kwwwwwk..w.w', 'kwwwwwk..w.w', 'kkkwwwk.w..w', '...kwwk...w.', '....kwk..w..', '.....kk.....'];
ICONS.soundOff = ['.....kk.....', '....kwk.....', '...kwwk.....', 'kkkwwwk.....', 'kwwwwwkr...r', 'kwwwwwk.r.r.', 'kwwwwwk..r..', 'kwwwwwk.r.r.', 'kkkwwwkr...r', '...kwwk.....', '....kwk.....', '.....kk.....'];
const ICON_PAL = { k: OUTLINE, y: '#f0c040', Y: '#c08820', w: '#ffffff', b: '#8a5a2c', g: '#9aa6b8', G: '#5c6878', r: '#e03050' };
const iconCache = {};
export function icon(name) {
  if (iconCache[name]) return iconCache[name];
  const rows = ICONS[name]; const cv = canvas(12, 12); const ctx = cv.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { ctx.fillStyle = ICON_PAL[ch]; ctx.fillRect(x, y, 1, 1); } }));
  iconCache[name] = cv.toDataURL();
  return iconCache[name];
}
