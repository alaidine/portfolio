import { Application, Container, Graphics, Text, TextureStyle } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.22.0/dist/pixi.min.mjs';
import { AFRO, FACE, SHADES, BODY, LEGS, BOY_BODY, BOY_LEGS, BOY_COLORS, OUTLINE, compose, drawSprite } from './sprites.js';

const T = 8; // tile size
const BPM = 100;
const PARTY = [0xff77a8, 0xffa300, 0xffec27, 0x00e436, 0x29adff, 0xb9a0ff];
const UI_FONT = '"Press Start 2P"';
const TITLE_FONT = '"Jacquard 24"';

// Movement, modelled on Celeste's player (values per 60Hz step)
const MAX_RUN = 1.35;
const RUN_ACCEL = 0.25;
const RUN_REDUCE = 0.11; // slow bleed when going faster than MAX_RUN, keeps dash momentum
const AIR_MULT = 0.65;
const GRAVITY = 0.25;
const HALF_GRAV = 0.67; // floaty apex while jump is held
const MAX_FALL = 2.7;
const FAST_FALL = 4; // holding down
const JUMP_SPEED = -1.9;
const DOUBLE_JUMP_SPEED = -1.75;
const VAR_JUMP = 12; // steps the jump speed is held while the button is down
const JUMP_H_BOOST = 0.5;
const WALL_JUMP_H = 2.1;
const WALL_JUMP_FORCE = 10; // steps of locked direction after a wall jump
const WALL_SLIDE_MAX = 1.1;
const DASH_SPEED = 3.8;
const DASH_TIME = 9;
const DASH_FREEZE = 3; // tiny hit-stop when a dash starts
const END_DASH = 2.4;
const END_DASH_UP = 0.75;
const SUPER_H = 3.4; // jumping out of a dash along the ground
const COYOTE = 6;
const BUFFER = 5;
const CORNER = 4; // pixels of corner correction
const DANCE_AFTER = 90; // steps standing still on the dance floor before dancing

// Party-goers, same style as the player: h = hair, s = skin, j = top, p = trousers, o = shoes
const HEADS = {
    short: ['.........', '..hhhhh..', '.hhhhhhh.', '.hhhsssss', '.hhsssss.', '..sssss..', '...sss...'],
    bun: ['...hhh...', '...hhh...', '..hhhhh..', '.hhhsssss', '.hhsssss.', '..sssss..', '...sss...'],
    long: ['..hhhhh..', '.hhhhhhh.', 'hhhhsssss', 'hhhsssss.', 'hhhssss..', 'hhh......', 'hh.......'],
};
const DANCERS = [
    { x: 43 * T, head: 'long', colors: { h: 0xd9a066, s: 0xf0c8a0, j: PARTY[0], p: 0x2c2350, o: 0xf2efe6 } },
    { x: 52 * T, head: 'short', colors: { h: 0x120c0a, s: 0x9c6b46, j: PARTY[4], p: 0x1a1430, o: 0xff77a8 } },
    { x: 59 * T, head: 'bun', colors: { h: 0x5a2a1a, s: 0x5c3620, j: PARTY[3], p: 0x34508f, o: 0xf2efe6 } },
];
const DJ_COLORS = { h: 0x120c0a, s: 0xc68a5a, j: PARTY[5], p: 0x1a1430, o: 0x1a1430 };

const NOTE = [
    '.xxxx',
    '.x..x',
    '.x..x',
    'xx.xx',
    'xx.xx',
];

const party = (i) => PARTY[((Math.floor(i) % PARTY.length) + PARTY.length) % PARTY.length];
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
const tinted = (colors, c) => Object.fromEntries(Object.keys(colors).map((k) => [k, c]));
const css = (c) => `#${c.toString(16).padStart(6, '0')}`;

function lerpColor(a, b, t) {
    const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function rng(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashString(s) {
    let h = 2166136261;
    for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
}

// pages: { about: { title, el }, contact: { title, el }, projects: [{ title, el }] }
// mount: element the canvas goes into. dialogEl: the HTML reading dialog. touch: on-screen controls in use.
export async function startGame({ pages, mount, dialogEl, touch = false }) {
    let W = 320;
    let H = 180;
    const projects = pages.projects;

    // Level: 0 = empty, 1 = solid, 2 = jump-through ledge.
    // Entrance, dance hall, a projects gallery sized to fit every project, then the climb to the balcony.
    const GX = 72;
    const GW = Math.max(20, projects.length * 9 + 8);
    const CX = GX + GW;
    const COLS = CX + 28;
    const ROWS = 23;
    const LEVEL_W = COLS * T;
    const LEVEL_H = ROWS * T;
    const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
    const solid = (x, y, w, h) => {
        for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j][i] = 1;
    };
    const ledge = (x, y, w) => {
        for (let i = x; i < x + w; i++) grid[y][i] = 2;
    };
    const tileAt = (tx, ty) => (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS ? 1 : grid[ty][tx]);

    // outer shell
    solid(0, 0, COLS, 1);
    solid(0, 0, 2, ROWS);
    solid(COLS - 2, 0, 2, ROWS);
    // entrance
    solid(0, 20, 35, 3);
    solid(23, 17, 12, 3);
    // shallow pit
    solid(35, 22, 5, 1);
    // dance hall
    solid(40, 20, 32, 3);
    solid(43, 1, 3, 1);
    solid(66, 1, 5, 1);
    ledge(46, 17, 6);
    ledge(55, 14, 8);
    ledge(49, 11, 5);
    // gallery
    solid(GX, 20, GW, 3);
    solid(GX, 1, GW, 1);
    // climb to the VIP balcony
    solid(CX, 20, 26, 3);
    solid(CX, 18, 3, 2);
    solid(CX + 4, 15, 3, 5);
    solid(CX + 8, 12, 3, 8);
    ledge(CX + 12, 9, 3);
    solid(CX + 15, 6, 11, 14);

    const inHall = (x) => x > 40 * T && x < 72 * T;
    const LANTERNS = [[5, 5], [32, 6], [37, 4], [CX + 3, 4], [CX + 9, 3]].map(([x, y], i) => ({ x: x * T, y: y * T, c: party(i * 2) }));
    const NOTES = [[25, 12], [50, 9], [48, 13], [CX + 6, 12], [CX + 13, 6]].map(([x, y]) => ({ x: x * T + 4, y: y * T + 4, got: false }));
    const BALL = { x: 56 * T, y: 30 };
    const BOOTH = { x: 520, y: 146 };
    const SPEAKERS = [500, 560];

    // Things you can read: signs for About and Contact, a poster per project
    const readables = [
        { kind: 'page', key: 'about', x: 29 * T + 4, y: 17 * T, c: PARTY[0] },
        { kind: 'page', key: 'contact', x: (CX + 20) * T, y: 6 * T, c: PARTY[4] },
        ...projects.map((p, i) => ({ kind: 'project', i, x: (GX + 6 + i * 9) * T + 4, y: 20 * T, top: 98, c: party(i * 2 + 1) })),
    ];

    // App setup

    TextureStyle.defaultOptions.scaleMode = 'nearest';
    const app = new Application();
    await app.init({ width: W, height: H, background: 0x07040f, antialias: false, resolution: 1, roundPixels: true });
    await Promise.all([document.fonts.load(`8px ${UI_FONT}`), document.fonts.load(`24px ${TITLE_FONT}`)]);
    app.canvas.setAttribute('aria-label', 'Portfolio game: walk to the signs and posters to read About, Projects and Contact');
    mount.replaceChildren(app.canvas);

    const label = (text, fill = 0xffffff, style = {}) =>
        new Text({ text, resolution: 1, style: { fontFamily: UI_FONT, fontSize: 8, fill, ...style } });
    const fancy = (text, fill = 0xffffff, style = {}) =>
        new Text({ text, resolution: 1, style: { fontFamily: TITLE_FONT, fontSize: 24, fill, ...style } });
    const plot = (g) => (x, y, color, alpha) => g.rect(x, y, 1, 1).fill({ color, alpha });

    // Layers, back to front
    const sky = new Graphics();
    const far = new Graphics();
    const mid = new Graphics();
    const world = new Container();
    const hud = new Container();
    app.stage.addChild(sky, far, mid, world, hud);

    const backdrop = new Graphics();
    const glowBack = new Graphics();
    const words = new Container();
    const decor = new Graphics();
    const signs = new Container();
    const tiles = new Graphics();
    const notesG = new Graphics();
    const actors = new Graphics();
    const playerView = new Container();
    const playerG = new Graphics();
    const fx = new Graphics();
    const glowFront = new Graphics();
    const prompt = new Graphics();
    playerView.addChild(playerG);
    glowBack.blendMode = 'add';
    glowFront.blendMode = 'add';
    world.addChild(backdrop, glowBack, words, decor, signs, tiles, notesG, actors, playerView, fx, glowFront, prompt);

    // Scenery

    function drawSky() {
        sky.clear();
        for (let y = 0; y < H; y += 6) {
            sky.rect(0, y, W, 6).fill(lerpColor(0x07040f, 0x1d1238, y / H));
        }
    }

    function drawFar() {
        far.clear();
        const r = rng(7);
        const top = [0, 0];
        for (let x = 0; x <= LEVEL_W; x += 8) top.push(x, 6 + r() * 22 + (r() < 0.2 ? 24 : 0));
        top.push(LEVEL_W, 0);
        far.poly(top).fill(0x110a20);
        const bottom = [0, H];
        for (let x = 0; x <= LEVEL_W; x += 8) bottom.push(x, H - 30 - r() * 35);
        bottom.push(LEVEL_W, H);
        far.poly(bottom).fill(0x110a20);
        for (let i = 0; i < 30; i++) {
            far.rect(Math.floor(r() * LEVEL_W), Math.floor(40 + r() * 80), 1, 1).fill({ color: party(i), alpha: 0.4 });
        }
    }

    function drawMid() {
        mid.clear();
        const r = rng(21);
        const pillars = [];
        for (let x = 10; x < LEVEL_W;) {
            const pw = 8 + Math.floor(r() * 8);
            mid.rect(x, 0, pw, H).fill(0x180f2c);
            mid.rect(x, 0, 1, H).fill(0x241840);
            pillars.push(x + pw / 2);
            x += pw + 50 + Math.floor(r() * 40);
        }
        // faded bunting strung between pillars
        for (let i = 0; i < pillars.length - 1; i++) {
            const x0 = pillars[i], x1 = pillars[i + 1];
            const sagY = (t) => 28 + Math.sin(t * Math.PI) * 12;
            for (let k = 0; k < 8; k++) {
                const t0 = k / 8, t1 = (k + 1) / 8;
                const ax = x0 + (x1 - x0) * t0, bx = x0 + (x1 - x0) * t1;
                mid.moveTo(ax, sagY(t0)).lineTo(bx, sagY(t1)).stroke({ width: 1, color: 0x2a1e4a });
                mid.poly([ax + 1, sagY(t0), ax + 5, sagY(t0) + 0.5, ax + 3, sagY(t0) + 5]).fill({ color: party(k + i), alpha: 0.3 });
            }
        }
    }

    function drawBackdrop() {
        // dance hall back wall with panels and bunting
        backdrop.rect(40 * T, T, 32 * T, 19 * T).fill(0x100919);
        for (let x = 40 * T; x < 72 * T; x += 16) backdrop.rect(x, T, 1, 19 * T).fill(0x1a1030);
        for (let k = 0; k < 32; k++) {
            const x = 40 * T + k * 8;
            const y = 14 + Math.round(Math.sin((k / 32) * Math.PI * 4) * 2);
            backdrop.rect(x, y, 8, 1).fill(0x3a2d5c);
            backdrop.poly([x + 1, y + 1, x + 7, y + 1, x + 4, y + 6]).fill({ color: party(k), alpha: 0.8 });
        }

        // gallery wall with a picture rail and one framed poster per project
        backdrop.rect(GX * T, 2 * T, GW * T, 18 * T).fill(0x0e0b1c);
        backdrop.rect(GX * T, 88, GW * T, 1).fill(0x2a2148);
        backdrop.rect(GX * T, 136, GW * T, 1).fill(0x1d1736);
        for (const r of readables) {
            if (r.kind !== 'project') continue;
            const pick = rng(hashString(projects[r.i].title));
            const fx0 = r.x - 14, fy0 = r.top;
            backdrop.rect(r.x, 88, 1, fy0 - 88).fill(0x2a2148);
            backdrop.rect(fx0, fy0, 28, 20).fill(0x2a1f45);
            backdrop.rect(fx0, fy0, 28, 20).stroke({ width: 1, color: r.c, alignment: 1 });
            // generated abstract art, different for every project title
            for (let gy = 0; gy < 4; gy++) {
                for (let gx = 0; gx < 6; gx++) {
                    const v = pick();
                    const color = v < 0.35 ? 0x140c26 : party(Math.floor(v * 60));
                    backdrop.rect(fx0 + 2 + gx * 4, fy0 + 2 + gy * 4, 4, 4).fill(color);
                }
            }
        }
    }

    function drawTiles() {
        // rock past the level edges, for views taller than the level
        tiles.rect(-T * 8, -T * 8, LEVEL_W + T * 16, T * 8).fill(0x1c1430);
        tiles.rect(-T * 8, LEVEL_H, LEVEL_W + T * 16, T * 8).fill(0x1c1430);
        const hash = (x, y) => {
            let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
        };
        for (let ty = 0; ty < ROWS; ty++) {
            for (let tx = 0; tx < COLS; tx++) {
                const t = grid[ty][tx];
                const px = tx * T, py = ty * T;
                const r = hash(tx, ty);
                if (t === 1) {
                    tiles.rect(px, py, T, T).fill(0x1c1430);
                    if (r < 0.35) tiles.rect(px + 1 + Math.floor(r * 40) % 6, py + 1 + Math.floor(r * 90) % 6, 1, 1).fill(0x2a1f45);
                    if (tileAt(tx, ty - 1) !== 1) {
                        tiles.rect(px, py, T, 2).fill(0x3d3066);
                        tiles.rect(px, py, T, 1).fill(0x5b4b8a);
                        // glowing party mushrooms, kept off the dance floor and gallery
                        if (r > 0.75 && ty > 1 && !(ty === 20 && tx >= 40 && tx < CX)) {
                            tiles.rect(px + 3, py - 2, 1, 2).fill(0x8a7bb5);
                            tiles.rect(px + 2, py - 3, 3, 1).fill(party(tx));
                        }
                    }
                    if (tileAt(tx - 1, ty) !== 1) tiles.rect(px, py, 1, T).fill(0x2b2148);
                    if (tileAt(tx + 1, ty) !== 1) tiles.rect(px + T - 1, py, 1, T).fill(0x120b22);
                    if (tileAt(tx, ty + 1) !== 1) tiles.rect(px, py + T - 1, T, 1).fill(0x120b22);
                } else if (t === 2) {
                    tiles.rect(px, py, T, 2).fill(0x6b5a99);
                    tiles.rect(px, py + 2, T, 1).fill(0x3d3066);
                    if (tx % 3 === 0) tiles.rect(px + 3, py + 3, 1, 3).fill(0x3d3066);
                }
            }
        }
    }

    function buildWords() {
        // title floating over the entrance
        const letters = [];
        const title = [...'Aalaaïddine'].map((ch, i) => {
            const t = fancy(ch, 0xffffff, { dropShadow: { color: 0x05030a, distance: 2, angle: Math.PI / 2, blur: 0, alpha: 1 } });
            t.tint = party(i);
            return t;
        });
        let x = Math.round(150 - title.reduce((s, t) => s + t.width, 0) / 2);
        for (const t of title) {
            t.position.set(x, 26);
            t.baseY = 26;
            x += t.width;
            words.addChild(t);
            letters.push(t);
        }
        const sub = label('ALI MLINDE', 0xd8cfff);
        sub.anchor.set(0.5, 0);
        sub.position.set(150, 56);
        const help = touch
            ? ['BUTTONS MOVE, JUMP x2', 'AND DASH, UP READ']
            : ['ARROWS MOVE, Z JUMP x2', 'X DASH, UP READ'];
        help.forEach((line, i) => {
            const t = label(line, 0x6f60a0);
            t.anchor.set(0.5, 0);
            t.position.set(150, 76 + i * 12);
            words.addChild(t);
        });

        const neon = fancy('dance', PARTY[0]);
        neon.anchor.set(0.5, 0);
        neon.position.set(BOOTH.x + 16, 92);
        const gallery = fancy('projects', PARTY[2]);
        gallery.anchor.set(0.5, 0);
        gallery.position.set((GX + GW / 2) * T, 30);
        words.addChild(sub, neon, gallery);
        return { letters, neon, gallery };
    }

    function buildSigns() {
        for (const r of readables) {
            if (r.kind === 'page') {
                const text = label(pages[r.key].title.toUpperCase(), r.c);
                const bw = text.width + 8, bh = 14;
                const bx = Math.round(r.x - bw / 2), by = r.y - 10 - bh;
                const board = new Graphics()
                    .rect(r.x, r.y - 10, 1, 10).fill(0x3d3066)
                    .rect(bx, by, bw, bh).fill(0x0d0818)
                    .rect(bx, by, bw, bh).stroke({ width: 1, color: r.c, alignment: 1 });
                text.position.set(bx + 4, by + 3);
                signs.addChild(board, text);
                r.top = by;
            } else {
                // poster title, shown when you walk up to it
                const name = label(projects[r.i].title.toUpperCase(), 0xffffff, {
                    dropShadow: { color: 0x05030a, distance: 1, angle: Math.PI / 2, blur: 0, alpha: 1 },
                });
                name.anchor.set(0.5, 0);
                name.position.set(r.x, r.top + 24);
                name.visible = false;
                signs.addChild(name);
                r.name = name;
            }
        }
    }

    drawBackdrop();
    drawTiles();
    buildSigns();
    const { letters, neon, gallery } = buildWords();

    // HUD
    const hudNote = new Graphics();
    drawSprite(plot(hudNote), NOTE, 8, 7, { x: PARTY[2] });
    const noteCount = label(`0/${NOTES.length}`);
    noteCount.position.set(16, 6);
    const toast = label('', 0xffffff);
    toast.anchor.set(0.5, 0);
    toast.position.set(W / 2, 20);
    toast.alpha = 0;
    hud.addChild(hudNote, noteCount, toast);

    // Input: keyboard, gamepad and on-screen buttons all feed the same key set

    let active = true;
    const keys = new Set();
    const pressed = new Set();
    const GAME_KEYS = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '];
    const CLOSE_KEYS = ['escape', 'x', 'z', 'c', 'backspace'];
    const JUMP_KEYS = [' ', 'z', 'c', 'k'];
    const DASH_KEYS = ['x', 'shift', 'j'];

    function input(k, down) {
        if (down) {
            if (!keys.has(k)) pressed.add(k);
            keys.add(k);
        } else {
            keys.delete(k);
        }
    }

    addEventListener('keydown', (e) => {
        if (!active) return;
        const k = e.key.toLowerCase();
        // while reading, leave arrows, space, tab and enter to the dialog so it scrolls and links work
        if (dialogOpen && !CLOSE_KEYS.includes(k)) return;
        input(k, true);
        if (GAME_KEYS.includes(k) || dialogOpen) e.preventDefault();
    });
    addEventListener('keyup', (e) => input(e.key.toLowerCase(), false));
    addEventListener('blur', () => keys.clear());

    let padKeys = new Set();
    function pollGamepad() {
        const gp = [...(navigator.getGamepads?.() || [])].find(Boolean);
        const want = new Set();
        if (gp) {
            const b = (i) => gp.buttons[i]?.pressed;
            const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
            if (ax < -0.4 || b(14)) want.add('arrowleft');
            if (ax > 0.4 || b(15)) want.add('arrowright');
            if (ay < -0.5 || b(12)) want.add('arrowup');
            if (ay > 0.5 || b(13)) want.add('arrowdown');
            if (b(0)) want.add('z'); // A: jump
            if (b(1) || b(2)) want.add('x'); // B or X: dash, also closes
            if (b(3)) want.add('e'); // Y: read
        }
        for (const k of want) if (!padKeys.has(k)) input(k, true);
        for (const k of padKeys) if (!want.has(k)) input(k, false);
        padKeys = want;
    }

    const held = (...ks) => ks.some((k) => keys.has(k));
    const hit = (...ks) => ks.some((k) => pressed.has(k));

    // State

    const P = {
        x: 6 * T, y: 20 * T - 12, w: 6, h: 12,
        vx: 0, vy: 0, rx: 0, ry: 0,
        face: 1, grounded: true, coyote: 0, jumpBuf: 0, dashBuf: 0,
        varJumpT: 0, varJumpSpeed: 0, forceT: 0, forceDir: 0,
        canDash: true, dashT: 0, dashDir: { x: 1, y: 0 }, freeze: 0, airJumps: 1, flash: 0,
        sx: 1, sy: 1, runT: 0, landT: 0, still: 0, afro: 0, wallSlide: false, rows: null,
    };
    const scarf = Array.from({ length: 6 }, () => ({ x: P.x, y: P.y }));
    const ghosts = [];
    const particles = [];
    const steps = []; // glowing footprints on the dance floor
    const r = rng(99);
    const motes = Array.from({ length: 50 }, () => ({ x: r() * LEVEL_W, y: r() * LEVEL_H, s: r() * 10, c: party(r() * 6) }));
    const spots = Array.from({ length: 18 }, () => ({ a: r() * Math.PI * 2, y: r(), c: party(r() * 6) }));
    const cam = { x: 0, y: 0 };
    let frame = 0;
    let landed = false;
    let shake = 0;
    let near = null;
    let dialogOpen = false;
    let notesGot = 0;
    let partyMode = false;
    let toastT = 0;

    function solidAt(x, y, w, h) {
        for (let ty = Math.floor(y / T); ty <= Math.floor((y + h - 1) / T); ty++) {
            for (let tx = Math.floor(x / T); tx <= Math.floor((x + w - 1) / T); tx++) {
                if (tileAt(tx, ty) === 1) return true;
            }
        }
        return false;
    }

    // A jump-through ledge only counts when the feet sit exactly on its top
    function ledgeBelow(x, y, w, h) {
        const by = y + h;
        if (by % T !== 0) return false;
        for (let tx = Math.floor(x / T); tx <= Math.floor((x + w - 1) / T); tx++) {
            if (tileAt(tx, by / T) === 2) return true;
        }
        return false;
    }

    const onGround = () => solidAt(P.x, P.y + 1, P.w, P.h) || ledgeBelow(P.x, P.y, P.w, P.h);
    // walls within 3px count for wall jumps, like Celeste
    const wallDir = () => (solidAt(P.x + 3, P.y, P.w, P.h) ? 1 : solidAt(P.x - 3, P.y, P.w, P.h) ? -1 : 0);

    function moveX(v) {
        P.rx += v;
        let n = Math.round(P.rx);
        P.rx -= n;
        const s = Math.sign(n);
        while (n !== 0) {
            if (solidAt(P.x + s, P.y, P.w, P.h)) {
                // a dash that clips a ledge lip pops up over it
                let popped = false;
                if (P.dashT > 0 && P.dashDir.y <= 0) {
                    for (let d = 1; d <= CORNER && !popped; d++) {
                        if (!solidAt(P.x + s, P.y - d, P.w, P.h)) {
                            P.y -= d;
                            popped = true;
                        }
                    }
                }
                if (!popped) {
                    P.vx = 0;
                    P.rx = 0;
                    break;
                }
            }
            P.x += s;
            n -= s;
        }
    }

    function moveY(v) {
        P.ry += v;
        let n = Math.round(P.ry);
        P.ry -= n;
        const s = Math.sign(n);
        while (n !== 0) {
            if (s > 0 && (solidAt(P.x, P.y + 1, P.w, P.h) || ledgeBelow(P.x, P.y, P.w, P.h))) {
                if (P.vy > 1.5) landed = true;
                P.vy = 0;
                P.ry = 0;
                break;
            }
            if (s < 0 && solidAt(P.x, P.y - 1, P.w, P.h)) {
                // bumping a corner with the head slides around it instead of stopping
                const dirs = P.vx > 0 ? [1] : P.vx < 0 ? [-1] : [1, -1];
                let slid = false;
                for (let d = 1; d <= CORNER && !slid; d++) {
                    for (const dir of dirs) {
                        if (!solidAt(P.x + dir * d, P.y - 1, P.w, P.h)) {
                            P.x += dir * d;
                            slid = true;
                            break;
                        }
                    }
                }
                if (!slid) {
                    P.vy = 0;
                    P.ry = 0;
                    P.varJumpT = 0;
                    break;
                }
            }
            P.y += s;
            n -= s;
        }
    }

    function squash(sx, sy) {
        P.sx = sx;
        P.sy = sy;
    }

    function dust(x, y, n) {
        for (let i = 0; i < n; i++) {
            particles.push({ x, y, vx: (Math.random() - 0.5) * 1.2, vy: -Math.random() * 0.6, life: 20 + Math.random() * 10, c: 0x8a7bb5, add: false });
        }
    }

    function burst(x, y, n) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 1.2;
            particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 25 + Math.random() * 15, c: party(i), add: true });
        }
    }

    function confetti(n) {
        for (let i = 0; i < n; i++) {
            particles.push({
                x: cam.x + Math.random() * W, y: cam.y - 2,
                vx: (Math.random() - 0.5) * 0.6, vy: 0.4 + Math.random() * 0.6,
                life: 240, c: party(Math.random() * 6), add: false, confetti: true,
            });
        }
    }

    function jump(speed, ix) {
        P.vy = speed;
        P.varJumpSpeed = speed;
        P.varJumpT = VAR_JUMP;
        P.vx += ix * JUMP_H_BOOST;
        P.coyote = 0;
        P.jumpBuf = 0;
        squash(0.65, 1.35);
    }

    function showToast(text) {
        toast.text = text;
        toastT = 150;
    }

    // Reading happens in an HTML dialog over the game, so text can scroll and links can be clicked

    const dialogTitle = dialogEl.querySelector('.dialog-title');
    const dialogBody = dialogEl.querySelector('.dialog-body');
    let hideTimer = 0;

    function openDialog(item) {
        const src = item.kind === 'page' ? pages[item.key] : projects[item.i];
        dialogEl.style.setProperty('--c', css(item.c));
        dialogTitle.textContent = src.title;
        dialogBody.replaceChildren(...[...src.el.children]
            .filter((el) => !/^H[1-6]$/.test(el.tagName))
            .map((el) => el.cloneNode(true)));
        dialogBody.scrollTop = 0;
        clearTimeout(hideTimer);
        dialogEl.hidden = false;
        requestAnimationFrame(() => dialogEl.classList.add('open'));
        dialogBody.focus({ preventScroll: true });
        dialogOpen = true;
    }

    function closeDialog() {
        dialogOpen = false;
        dialogEl.classList.remove('open');
        hideTimer = setTimeout(() => { dialogEl.hidden = true; }, 200);
        if (dialogEl.contains(document.activeElement)) document.activeElement.blur();
    }

    dialogEl.addEventListener('click', (e) => {
        if (e.target === dialogEl || e.target.closest('.dialog-close')) closeDialog();
    });

    function step() {
        frame++;
        landed = false;

        let justClosed = false;
        if (dialogOpen) {
            if (hit(...CLOSE_KEYS)) {
                closeDialog();
                justClosed = true;
            }
        } else if (near && P.grounded && hit('arrowup', 'w', 'e')) {
            openDialog(near);
        }

        const free = !dialogOpen && !justClosed;
        let ix = free ? (held('arrowright', 'd') ? 1 : 0) - (held('arrowleft', 'a') ? 1 : 0) : 0;
        const iy = free ? (held('arrowdown', 's') ? 1 : 0) - (held('arrowup', 'w') ? 1 : 0) : 0;
        const jumpHeld = free && held(...JUMP_KEYS);
        if (free && hit(...JUMP_KEYS)) P.jumpBuf = BUFFER;
        if (free && hit(...DASH_KEYS)) P.dashBuf = BUFFER;

        if (P.freeze > 0) {
            P.freeze--;
            effects();
            return;
        }

        P.grounded = onGround();
        if (P.grounded) {
            P.coyote = COYOTE;
            P.airJumps = 1;
            if (P.dashT === 0 && !P.canDash) {
                P.canDash = true;
                P.flash = 6;
            }
        } else if (P.coyote > 0) {
            P.coyote--;
        }
        if (P.forceT > 0) {
            P.forceT--;
            ix = P.forceDir;
        }
        P.wallSlide = false;

        if (P.dashBuf > 0 && P.canDash) {
            let dx = ix, dy = iy;
            // up + dash in the air goes diagonally forward
            if (!dx && (dy === 0 || (dy < 0 && !P.grounded))) dx = P.face;
            const len = Math.hypot(dx, dy);
            P.dashDir = { x: dx / len, y: dy / len };
            P.vx = P.dashDir.x * DASH_SPEED;
            P.vy = P.dashDir.y * DASH_SPEED;
            P.dashT = DASH_TIME;
            P.canDash = false;
            P.dashBuf = 0;
            P.varJumpT = 0;
            P.freeze = DASH_FREEZE;
            shake = 6;
            if (dx) P.face = Math.sign(dx);
            burst(P.x + 3, P.y + 6, 8);
        }

        if (P.dashT > 0) {
            P.dashT--;
            if (frame % 2 === 0 && P.rows) ghosts.push({ x: P.x, y: P.y, face: P.face, rows: P.rows, life: 1, c: party(frame / 2) });
            if (P.jumpBuf > 0 && P.coyote > 0 && P.dashDir.x !== 0 && P.dashDir.y >= 0) {
                // super (sideways) or hyper (down-diagonal) jump out of a dash along the ground
                const hyper = P.dashDir.y > 0;
                P.dashT = 0;
                P.canDash = true;
                jump(JUMP_SPEED * (hyper ? 0.55 : 1), 0);
                P.vx = Math.sign(P.dashDir.x) * SUPER_H * (hyper ? 1.25 : 1);
                dust(P.x + 3, P.y + P.h, 6);
                burst(P.x + 3, P.y + P.h, 8);
            } else if (P.dashT === 0 && P.dashDir.y <= 0) {
                P.vx = P.dashDir.x * END_DASH;
                P.vy = P.dashDir.y * END_DASH * (P.dashDir.y < 0 ? END_DASH_UP : 1);
            }
        } else {
            // run: quick to reach top speed, slow to lose extra speed
            const mult = P.grounded ? 1 : AIR_MULT;
            if (Math.abs(P.vx) > MAX_RUN && Math.sign(P.vx) === ix) P.vx = approach(P.vx, MAX_RUN * ix, RUN_REDUCE * mult);
            else P.vx = approach(P.vx, MAX_RUN * ix, RUN_ACCEL * mult);
            if (ix) P.face = ix;

            if (!P.grounded) {
                let maxFall = iy > 0 ? FAST_FALL : MAX_FALL;
                if (ix && P.vy >= 0 && solidAt(P.x + ix, P.y, P.w, P.h)) {
                    maxFall = Math.min(maxFall, WALL_SLIDE_MAX);
                    P.wallSlide = true;
                    if (frame % 8 === 0) dust(P.x + (ix > 0 ? P.w : 0), P.y + 6, 1);
                }
                const g = Math.abs(P.vy) < HALF_GRAV && jumpHeld ? GRAVITY / 2 : GRAVITY;
                P.vy = approach(P.vy, maxFall, g);
            }

            // holding jump keeps the launch speed for a moment: short taps give short hops
            if (P.varJumpT > 0) {
                if (jumpHeld) P.vy = Math.min(P.vy, P.varJumpSpeed);
                else P.varJumpT = 0;
            }

            if (P.jumpBuf > 0) {
                const wall = wallDir();
                if (P.coyote > 0) {
                    if (iy > 0 && ledgeBelow(P.x, P.y, P.w, P.h) && !solidAt(P.x, P.y + 1, P.w, P.h)) {
                        P.jumpBuf = 0;
                        P.y += 1; // drop through the ledge
                    } else {
                        jump(JUMP_SPEED, ix);
                        dust(P.x + 3, P.y + P.h, 4);
                    }
                } else if (wall) {
                    jump(JUMP_SPEED, 0);
                    P.vx = -wall * WALL_JUMP_H;
                    P.face = -wall;
                    P.forceT = WALL_JUMP_FORCE;
                    P.forceDir = -wall;
                    dust(P.x + (wall > 0 ? P.w : 0), P.y + 6, 4);
                } else if (P.airJumps > 0) {
                    P.airJumps--;
                    jump(DOUBLE_JUMP_SPEED, ix);
                    burst(P.x + 3, P.y + P.h, 10);
                }
            }
        }
        if (P.varJumpT > 0) P.varJumpT--;
        if (P.jumpBuf > 0) P.jumpBuf--;
        if (P.dashBuf > 0) P.dashBuf--;

        moveX(P.vx);
        moveY(P.vy);

        if (landed) {
            squash(1.4, 0.65);
            dust(P.x + 3, P.y + P.h, 5);
            P.landT = 6;
        }
        if (P.landT > 0) P.landT--;
        if (P.flash > 0) P.flash--;
        P.sx = approach(P.sx, 1, 0.06);
        P.sy = approach(P.sy, 1, 0.06);
        P.runT = P.grounded && Math.abs(P.vx) > 0.3 ? P.runT + 1 : 0;
        P.still = P.grounded && ix === 0 && Math.abs(P.vx) < 0.1 && P.dashT === 0 && !dialogOpen ? P.still + 1 : 0;
        // the afro trails behind when moving and catches up when stopping
        P.afro += (Math.max(-1, Math.min(1, -P.vx * P.face * 0.8)) - P.afro) * 0.2;

        // light up the dance floor where you step
        if (P.grounded && inHall(P.x + 3) && (P.runT % 6 === 1 || landed)) {
            steps.push({ x: P.x + 3, life: 1, c: party(frame / 6) });
        }

        // scarf trails behind like hair
        scarf[0].x = P.x + 3 - P.face * 2;
        scarf[0].y = P.y + 7;
        for (let i = 1; i < scarf.length; i++) {
            const prev = scarf[i - 1];
            const tx = prev.x - P.face * 1.5;
            const ty = prev.y + 0.4 + Math.sin(frame * 0.15 + i) * 0.3;
            scarf[i].x += (tx - scarf[i].x) * 0.55;
            scarf[i].y += (ty - scarf[i].y) * 0.55;
        }

        near = readables.find((s) => Math.abs(P.x + 3 - s.x) < 14 && Math.abs(P.y + P.h - s.y) < 6) || null;

        for (const n of NOTES) {
            if (n.got || Math.hypot(P.x + 3 - n.x, P.y + 6 - n.y) > 8) continue;
            n.got = true;
            notesGot++;
            noteCount.text = `${notesGot}/${NOTES.length}`;
            burst(n.x, n.y, 12);
            if (notesGot === NOTES.length) {
                partyMode = true;
                confetti(60);
                showToast('PARTY MODE!');
            } else {
                showToast(`NOTE ${notesGot}/${NOTES.length}`);
            }
        }

        effects();
    }

    // particles, camera and timers keep running during hit-stop
    function effects() {
        if (partyMode && frame % 3 === 0) confetti(1);
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx + (p.confetti ? Math.sin((frame + i) * 0.05) * 0.2 : 0);
            p.y += p.vy;
            p.vy += p.confetti ? 0 : p.add ? 0.01 : 0.03;
            if (!p.confetti) p.vx *= 0.96;
            if (--p.life <= 0 || p.y > LEVEL_H) particles.splice(i, 1);
        }
        for (let i = ghosts.length - 1; i >= 0; i--) {
            ghosts[i].life -= 0.08;
            if (ghosts[i].life <= 0) ghosts.splice(i, 1);
        }
        for (let i = steps.length - 1; i >= 0; i--) {
            steps[i].life -= 0.015;
            if (steps[i].life <= 0) steps.splice(i, 1);
        }
        for (const m of motes) {
            m.y -= 0.12;
            m.x += Math.sin(frame * 0.01 + m.s) * 0.1;
            if (m.y < 0) m.y = LEVEL_H;
        }

        // camera leads a little in the facing direction
        const tx = Math.max(0, Math.min(LEVEL_W - W, P.x + 3 - W / 2 + P.face * 16));
        const ty = Math.max(0, Math.min(LEVEL_H - H, P.y - H / 2));
        cam.x += (tx - cam.x) * 0.1;
        cam.y += (ty - cam.y) * 0.1;

        if (shake > 0) shake--;
        if (toastT > 0) toastT--;
    }

    // Rendering

    function playerRows(beat, dancing) {
        const bi = Math.floor(beat);
        const runFrame = Math.floor(P.runT / 7) % 2;
        let body = BODY.idle, legs = LEGS.stand, bob = 0;
        if (dancing) {
            body = bi % 2 ? BODY.up : BODY.fall;
            legs = beat - bi < 0.25 ? LEGS.jump : LEGS.stand;
        } else if (P.dashT > 0) {
            body = BODY.dash;
            legs = LEGS.jump;
        } else if (!P.grounded) {
            if (P.wallSlide) {
                body = BODY.wall;
                legs = LEGS.wall;
            } else if (P.vy < -0.3) {
                body = BODY.up;
                legs = LEGS.jump;
            } else {
                body = BODY.fall;
                legs = LEGS.fall;
            }
        } else if (P.runT) {
            body = runFrame ? BODY.swing : BODY.idle;
            legs = runFrame ? LEGS.runB : LEGS.runA;
            bob = runFrame;
        }
        // afro lifts when falling fast and squashes down after landing
        const afroY = !P.grounded && P.vy > 1.6 ? -1 : P.landT > 0 ? 1 : 0;
        const afroX = 1 + Math.round(P.afro);
        const parts = [
            { rows: body, x: 1, y: 8 },
            { rows: legs, x: 1, y: 11 },
            { rows: FACE, x: 1, y: 5 + bob },
            { rows: AFRO, x: afroX, y: 1 + bob + Math.max(0, afroY) },
        ];
        // when lifting, the afro stretches up rather than detaching from the head
        if (afroY < 0) parts.push({ rows: AFRO, x: afroX, y: 1 + bob + afroY });
        if (partyMode) parts.push({ rows: SHADES, x: 1, y: 5 + bob });
        return compose(parts, 11, 13);
    }

    function render(time) {
        const beat = (time * BPM) / 60;
        const bi = Math.floor(beat);
        const bf = beat - bi;
        const pulse = (1 - bf) ** 2;

        const sx = shake ? Math.round(Math.random() * 2 - 1) : 0;
        const sy = shake ? Math.round(Math.random() * 2 - 1) : 0;
        world.position.set(-Math.round(cam.x) + sx, -Math.round(cam.y) + sy);
        far.x = -Math.round(cam.x * 0.25);
        mid.x = -Math.round(cam.x * 0.5);

        // disco ball light: spots on the back wall and two slow beams
        glowBack.clear();
        const spin = partyMode ? 0.6 : 0.2;
        for (const s of spots) {
            const a = s.a + time * spin;
            const front = Math.cos(a);
            if (front <= 0) continue;
            const x = Math.round(BALL.x + Math.sin(a) * 140);
            if (x < 40 * T || x > 72 * T) continue;
            glowBack.rect(x, Math.round(T + s.y * 140), 2, 2).fill({ color: s.c, alpha: front * 0.6 });
        }
        for (let n = 0; n < 2; n++) {
            const ex = BALL.x + Math.sin(beat * Math.PI / 16 + n * 2.5) * 90;
            glowBack.poly([BALL.x, BALL.y, ex - 14, 160, ex + 14, 160]).fill({ color: party(n * 4), alpha: 0.05 });
        }
        // a soft spotlight on every poster
        for (const r of readables) {
            if (r.kind !== 'project') continue;
            const lit = near === r ? 0.09 : 0.04;
            glowBack.poly([r.x - 3, 2 * T, r.x + 3, 2 * T, r.x + 22, 160, r.x - 22, 160]).fill({ color: r.c, alpha: lit });
        }

        // title bob and neon flicker
        letters.forEach((t, i) => {
            t.y = t.baseY + Math.round(Math.sin(beat * Math.PI / 4 + i * 0.5));
        });
        neon.alpha = 0.8 + 0.2 * Math.sin(time * 3);
        neon.tint = party(Math.floor(beat / 8) * 2);
        gallery.alpha = 0.85 + 0.15 * Math.sin(time * 2.3 + 1);

        decor.clear();
        glowFront.clear();

        for (const l of LANTERNS) {
            decor.rect(l.x, T, 1, l.y - T - 4).fill(0x2c2050);
            decor.rect(l.x - 2, l.y - 4, 5, 1).fill(0x2c2050);
            decor.rect(l.x - 2, l.y - 3, 5, 6).fill(l.c);
            decor.rect(l.x - 1, l.y - 2, 1, 3).fill(0xffffff);
            decor.rect(l.x - 2, l.y + 3, 5, 1).fill(0x2c2050);
            glowFront.circle(l.x, l.y, 16 + pulse).fill({ color: l.c, alpha: 0.06 });
            glowFront.circle(l.x, l.y, 8).fill({ color: l.c, alpha: 0.1 });
        }

        // disco ball
        const br = 7;
        decor.rect(BALL.x, T, 1, BALL.y - br - T).fill(0x5f574f);
        decor.circle(BALL.x, BALL.y, br).fill(0x2a2838);
        for (let j = 0, y = -br; y < br; j++, y += 3) {
            for (let i = 0, x = -br; x < br; i++, x += 3) {
                if ((x + 1) ** 2 + (y + 1) ** 2 > (br - 1) ** 2) continue;
                decor.rect(BALL.x + x, BALL.y + y, 2, 2).fill([0xffffff, 0xc2c3c7, 0x5f574f, 0xc2c3c7][(Math.floor(time * (partyMode ? 5 : 1.5)) + i + j * 2) % 4]);
            }
        }
        glowFront.circle(BALL.x, BALL.y, 26).fill({ color: 0xb9a0ff, alpha: 0.05 });

        // dance floor: tiles pulse with the beat, footprints glow and fade
        for (let tx = 40; tx < 72; tx++) {
            if ((tx + bi) % 2) continue;
            glowFront.rect(tx * T, 160, T, 1).fill({ color: party(tx / 2 + bi), alpha: 0.25 * pulse });
        }
        for (const s of steps) {
            glowFront.rect(Math.round(s.x) - 4, 159, 8, 2).fill({ color: s.c, alpha: s.life * 0.7 });
            glowFront.circle(s.x, 158, 6).fill({ color: s.c, alpha: s.life * 0.08 });
        }

        // speakers pump on the beat
        for (const x of SPEAKERS) {
            decor.rect(x, 142, 12, 18).fill(0x15101f).rect(x, 142, 12, 18).stroke({ width: 1, color: 0x2c2050, alignment: 1 });
            decor.circle(x + 6, 147, 2 + pulse * 0.8).fill(0x3d3066);
            decor.circle(x + 6, 155, 3 + pulse).fill(0x3d3066);
        }

        // dancers turn and hop on the beat, face you and hop higher when you come close
        const px = P.x + 3;
        DANCERS.forEach((d, i) => {
            const close = Math.abs(d.x - px) < 48;
            const hop = partyMode ? (bf < 0.4 ? 2 : 0) : bf < 0.25 ? (close ? 2 : 1) : 0;
            const flip = close ? px < d.x : (bi + i) % 2 === 0;
            const rows = [...HEADS[d.head], ...BOY_BODY[(bi + i) % 2], ...BOY_LEGS[hop ? 3 : 0]];
            drawSprite(plot(decor), rows, d.x - 4, 160 - 12 - hop, d.colors, { flip, outline: OUTLINE });
        });

        // DJ with headphones behind the booth
        const djHop = bf < 0.25 ? 1 : 0;
        const djX = BOOTH.x + 12, djY = 136 - djHop;
        drawSprite(plot(decor), [...HEADS.short, ...BOY_BODY[0]], djX, djY, DJ_COLORS, { outline: OUTLINE });
        decor.rect(djX + 1, djY + 1, 1, 4).fill(PARTY[0]);
        decor.rect(djX + 2, djY, 6, 1).fill(PARTY[0]);
        decor.rect(BOOTH.x, BOOTH.y, 32, 14).fill(0x1a1430);
        decor.rect(BOOTH.x, BOOTH.y, 32, 1).fill(0x5b4b8a);
        decor.rect(BOOTH.x + 2, BOOTH.y + 6, 28, 1).fill(party(Math.floor(beat / 4)));
        decor.rect(BOOTH.x + 3, BOOTH.y - 2, 8, 2).fill(0x5f574f);
        decor.rect(BOOTH.x + 21, BOOTH.y - 2, 8, 2).fill(0x5f574f);

        // sign glows, poster titles and the read prompt
        prompt.clear();
        for (const s of readables) {
            if (s.kind === 'page') glowFront.circle(s.x, s.top + 7, 18).fill({ color: s.c, alpha: 0.05 });
            else s.name.visible = near === s && !dialogOpen;
        }
        if (near && !dialogOpen) {
            const y = near.top - 7 + Math.round(Math.sin(time * 5));
            prompt.poly([near.x - 3, y + 3, near.x, y, near.x + 3, y + 3]).fill(0xffffff);
        }

        // music notes
        notesG.clear();
        NOTES.forEach((n, i) => {
            if (n.got) return;
            const y = Math.round(n.y - 2 + Math.sin(time * 2 + i) * 1.5);
            drawSprite(plot(notesG), NOTE, n.x - 2, y, { x: PARTY[2] });
            glowFront.circle(n.x, y + 2, 8).fill({ color: PARTY[2], alpha: 0.1 });
        });

        // dash afterimages and scarf
        actors.clear();
        for (const g of ghosts) {
            drawSprite(plot(actors), g.rows, g.x - 2, g.y - 1, tinted(BOY_COLORS, g.c), { alpha: g.life * 0.5, flip: g.face < 0 });
        }
        const scarfColor = P.dashT > 0 ? party(frame / 2) : P.canDash ? PARTY[0] : PARTY[4];
        scarf.forEach((s, i) => {
            const size = i < 3 ? 2 : 1;
            actors.rect(Math.round(s.x) - 1, Math.round(s.y) - 1, size, size).fill(scarfColor);
        });

        // player, dancing when left standing on the dance floor
        const dancing = P.still > DANCE_AFTER && inHall(px);
        const rows = playerRows(beat, dancing);
        P.rows = rows;
        const colors = P.flash > 0 ? tinted(BOY_COLORS, 0xffffff) : BOY_COLORS;
        const flip = dancing ? Math.floor(bi / 2) % 2 === 1 : P.face < 0;
        const hop = dancing && bf < 0.25 ? 1 : 0;
        playerG.clear();
        drawSprite(plot(playerG), rows, -5, -13 - hop, colors, { flip, outline: OUTLINE });
        playerView.position.set(Math.round(P.x + P.w / 2), Math.round(P.y + P.h));
        playerView.scale.set(P.sx, P.sy);
        glowFront.circle(px, P.y + 6, 20).fill({ color: 0xd8cfff, alpha: 0.04 });

        fx.clear();
        for (const p of particles) {
            const target = p.add ? glowFront : fx;
            const alpha = p.confetti ? 1 : Math.min(1, p.life / 15);
            const wide = p.confetti && Math.floor((frame + p.x) / 8) % 2 === 0;
            target.rect(Math.round(p.x), Math.round(p.y), wide ? 2 : 1, 1).fill({ color: p.c, alpha });
        }
        for (const m of motes) {
            glowFront.rect(Math.round(m.x), Math.round(m.y), 1, 1).fill({ color: m.c, alpha: 0.4 + 0.3 * Math.sin(time * 2 + m.s) });
        }

        toast.alpha = Math.min(1, toastT / 30);
    }

    // The view grows with the window: about 180 game pixels tall, scaled by whole pixels
    function fit() {
        const scale = Math.max(1, Math.min(Math.round(innerHeight / 180), Math.floor(innerWidth / 256)));
        W = Math.ceil(innerWidth / scale);
        H = Math.ceil(innerHeight / scale);
        app.renderer.resize(W, H);
        mount.style.width = `${W * scale}px`;
        mount.style.height = `${H * scale}px`;
        mount.style.setProperty('--px', `${scale}px`);
        drawSky();
        drawFar();
        drawMid();
        toast.x = W / 2;
    }
    addEventListener('resize', () => active && fit());

    fit();
    cam.y = Math.max(0, LEVEL_H - H);

    // Main loop: fixed 60Hz physics, render every frame
    const start = performance.now();
    let acc = 0;
    app.ticker.add((ticker) => {
        pollGamepad();
        acc += Math.min(ticker.deltaMS, 100) / 1000;
        while (acc >= 1 / 60) {
            step();
            pressed.clear();
            acc -= 1 / 60;
        }
        render((performance.now() - start) / 1000);
    });

    return {
        pause() {
            active = false;
            keys.clear();
            pressed.clear();
            if (dialogOpen) closeDialog();
            app.ticker.stop();
        },
        resume() {
            active = true;
            fit();
            app.ticker.start();
        },
        input,
        // for tests and debugging
        _debug: { P, step, keys, pressed, readables, openDialog },
    };
}
