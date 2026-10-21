import { Application, Container, Graphics, Rectangle, Text, TextureStyle } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.22.0/dist/pixi.min.mjs';

// The game renders at this resolution and gets scaled up with crisp pixels
const W = 320;
const H = 180;
const BPM = 100;
const PALETTE = [0xff77a8, 0xffa300, 0xffec27, 0x00e436, 0x29adff, 0x83769c];
const BG = 0x0b0518;
const FLOOR_DARK = 0x1a0b2e;
const FONT = '"Press Start 2P"';

const PAGES = [
    {
        title: 'About',
        body: "Hi! I'm Aalaaïddine Ali Mlinde.\n\nWelcome to my party portfolio, grab a drink and have a look around.\n\n(More coming soon)",
    },
    {
        title: 'Projects',
        body: '- Project one\n- Project two\n- Project three\n\n(Placeholders)',
    },
    {
        title: 'Contact',
        body: 'Email: you@mail.com\nGitHub: alaidine\n\n(Placeholders)',
    },
];

// 13x16 dancer, arms up-left / down-right. Mirrored for the other pose.
// x = body colour, k = black
const DANCER = [
    '.....xxx.....',
    'x...xxxxx....',
    '.x..kkkkk....',
    '.x..xxxxx....',
    '..x..xxx.....',
    '...xxxxxxx...',
    '....xxxxx.x..',
    '....xxxxx..x.',
    '....xxxxx..x.',
    '....xxxxx...x',
    '....xxxxx....',
    '....xx.xx....',
    '....xx.xx....',
    '...xx...xx...',
    '...xx...xx...',
    '..kkk...kkk..',
];

const color = (i) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];

TextureStyle.defaultOptions.scaleMode = 'nearest';

const app = new Application();
await app.init({ width: W, height: H, background: BG, antialias: false, resolution: 1, roundPixels: true });
const screen = document.getElementById('screen');
screen.appendChild(app.canvas);
await document.fonts.load(`8px ${FONT}`);

// Scale the canvas by whole pixels when there's room, so pixels stay square
function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H) * 0.94;
    const scale = s >= 1 ? Math.floor(s) : s;
    screen.style.width = `${W * scale}px`;
    screen.style.height = `${H * scale}px`;
    screen.style.setProperty('--px', `${scale}px`);
}
fit();
addEventListener('resize', fit);

const label = (text, fill = 0xffffff, size = 8, style = {}) =>
    new Text({ text, resolution: 1, style: { fontFamily: FONT, fontSize: size, fill, ...style } });

// Layers, back to front
const glow = new Graphics();
const floor = new Graphics();
const beams = new Graphics();
const reflections = new Graphics();
const dancers = new Graphics();
const ball = new Graphics();
const confetti = new Graphics();
const hud = new Container();
const title = new Container();
const menu = new Container();
const panel = new Container();
glow.blendMode = 'add';
beams.blendMode = 'add';
reflections.blendMode = 'add';
app.stage.addChild(glow, floor, beams, reflections, dancers, ball, confetti, hud, title, menu, panel);

let selected = 0;
let current = 0;
let panelOpen = false;
let panelT = 0;
let panelParts = null;
let score = 0;
let hiScore = 50000;

const dots = Array.from({ length: 24 }, () => ({
    a: Math.random() * Math.PI * 2,
    y: Math.random(),
    c: color(Math.floor(Math.random() * PALETTE.length)),
}));

const flakes = Array.from({ length: 30 }, () => newFlake(true));

function newFlake(anywhere) {
    return {
        x: Math.random() * W,
        y: anywhere ? Math.random() * H : -4,
        vx: (Math.random() - 0.5) * 0.2,
        vy: 0.15 + Math.random() * 0.25,
        flip: Math.random() * 10,
        c: color(Math.floor(Math.random() * PALETTE.length)),
    };
}

// HUD
const oneUp = label('1UP', PALETTE[0]);
oneUp.position.set(8, 4);
const scoreText = label('000000');
scoreText.position.set(8, 14);
const hiLabel = label('HI-SCORE', PALETTE[4]);
hiLabel.anchor.set(0.5, 0);
hiLabel.position.set(W / 2, 4);
const hiText = label(String(hiScore).padStart(6, '0'));
hiText.anchor.set(0.5, 0);
hiText.position.set(W / 2, 14);
const credit = label('CREDIT 01', PALETTE[2]);
credit.anchor.set(1, 0);
credit.position.set(W - 8, 4);
const pushStart = label('PUSH START');
pushStart.anchor.set(1, 0);
pushStart.position.set(W - 8, 14);
hud.addChild(oneUp, scoreText, hiLabel, hiText, credit, pushStart);

// Title, one Text per letter so they can wave
const letters = [];
for (const [str, size, y] of [['AALAAÏDDINE', 16, 64], ['ALI MLINDE', 8, 86]]) {
    let x = Math.round(W / 2 - (str.length * size) / 2);
    [...str].forEach((ch) => {
        const t = label(ch, 0xffffff, size, {
            dropShadow: { color: 0x1a0033, distance: size / 4, angle: Math.PI / 4, blur: 0, alpha: 1 },
        });
        t.position.set(x, y);
        t.baseY = y;
        x += size;
        title.addChild(t);
        letters.push(t);
    });
}

// Menu
menu.addChild(new Graphics().rect(0, 160, W, H - 160).fill({ color: 0x000000, alpha: 0.75 }));
const arrow = new Graphics();
const buttons = PAGES.map((p, i) => {
    const t = label(p.title.toUpperCase());
    t.anchor.set(0.5, 0);
    t.position.set([56, 160, 264][i], 166);
    t.eventMode = 'static';
    t.cursor = 'pointer';
    t.hitArea = new Rectangle(-t.width / 2 - 10, -4, t.width + 14, 16);
    t.on('pointerover', () => { selected = i; });
    t.on('pointertap', () => openPage(i));
    menu.addChild(t);
    return t;
});
menu.addChild(arrow);

function openPage(i) {
    current = i;
    selected = i;
    panelOpen = true;
    panelT = 0;
    score += 100;
    hiScore = Math.max(hiScore, score);
    scoreText.text = String(score).padStart(6, '0');
    hiText.text = String(hiScore).padStart(6, '0');
    buildPanel();
}

function closePage() {
    panelOpen = false;
}

function buildPanel() {
    panel.removeChildren().forEach((c) => c.destroy({ children: true }));
    const page = PAGES[current];
    const bw = 272, bh = 140, bx = (W - bw) / 2, by = (H - bh) / 2;

    const dim = new Graphics().rect(0, 0, W, H).fill(0x000000);
    dim.eventMode = 'static';
    dim.on('pointertap', closePage);

    const box = new Graphics();
    box.eventMode = 'static'; // swallow clicks so they don't reach the dim layer
    box.hitArea = new Rectangle(bx, by, bw, bh);

    const content = new Container();
    const heading = label(page.title.toUpperCase(), color(current * 2));
    heading.position.set(bx + 12, by + 12);
    const body = label(page.body, 0xffffff, 8, { wordWrap: true, wordWrapWidth: bw - 24, lineHeight: 12 });
    body.position.set(bx + 12, by + 30);
    const hint = label('X/ESC: BACK', PALETTE[5]);
    hint.anchor.set(1, 1);
    hint.position.set(bx + bw - 10, by + bh - 9);
    hint.eventMode = 'static';
    hint.cursor = 'pointer';
    hint.on('pointertap', closePage);
    content.addChild(heading, body, hint);

    panel.addChild(dim, box, content);
    panelParts = { dim, box, content, hint, bw, bh, bx, by };
}

window.addEventListener('keydown', (e) => {
    if (panelOpen) {
        if (['Escape', 'x', 'X', 'Enter', ' '].includes(e.key)) closePage();
        return;
    }
    if (e.key === 'ArrowLeft') selected = (selected + PAGES.length - 1) % PAGES.length;
    if (e.key === 'ArrowRight') selected = (selected + 1) % PAGES.length;
    if (['Enter', ' ', 'z', 'Z'].includes(e.key)) openPage(selected);
});

// Per-frame drawing

function drawGlow(cx, cy) {
    glow.clear();
    for (let k = 5; k >= 1; k--) {
        glow.circle(cx, cy, 10 + k * 9).fill({ color: 0xb9a0ff, alpha: 0.03 });
    }
}

function drawFloor(time, pulse) {
    const hy = 100, rows = 6, cols = 10;
    floor.clear();
    floor.rect(0, hy, W, H - hy).fill(FLOOR_DARK);
    const rowY = (t) => Math.round(hy + (H - hy) * t * t);
    const halfW = (t) => W * (0.4 + 0.8 * t);
    for (let j = 0; j < rows; j++) {
        const t0 = j / rows, t1 = (j + 1) / rows;
        const y0 = rowY(t0), y1 = rowY(t1), w0 = halfW(t0), w1 = halfW(t1);
        for (let i = 0; i < cols; i++) {
            const u0 = i / cols - 0.5, u1 = (i + 1) / cols - 0.5;
            const wave = 0.5 + 0.5 * Math.sin(time * 0.6 - (i + j) * 0.5);
            floor
                .poly([W / 2 + u0 * 2 * w0, y0, W / 2 + u1 * 2 * w0, y0, W / 2 + u1 * 2 * w1, y1, W / 2 + u0 * 2 * w1, y1])
                .fill({ color: color(Math.floor((i + j) / 2)), alpha: 0.08 + 0.25 * wave + 0.04 * pulse })
                .stroke({ width: 1, color: 0x000000, alpha: 0.7 });
        }
    }
}

function drawBeams(beat) {
    beams.clear();
    [[0, 0], [W, 0]].forEach(([sx, sy], n) => {
        const ex = W / 2 + Math.sin(beat * Math.PI / 16 + n * 2) * W * 0.4;
        beams.poly([sx, sy, ex - 24, H, ex + 24, H]).fill({ color: color(n * 4), alpha: 0.06 });
    });
}

function drawReflections(time) {
    reflections.clear();
    for (const d of dots) {
        const a = d.a + time * 0.2;
        const front = Math.cos(a);
        if (front <= 0) continue;
        reflections.rect(Math.round(W / 2 + Math.sin(a) * W * 0.55), Math.round(d.y * H * 0.9), 1, 1)
            .fill({ color: d.c, alpha: front * 0.6 });
    }
}

function drawBall(cx, cy, time) {
    const r = 13;
    const shades = [0xffffff, 0xc2c3c7, 0x5f574f, 0xc2c3c7];
    ball.clear();
    ball.rect(cx, 24, 1, cy - r - 24).fill(0x5f574f);
    ball.circle(cx, cy, r).fill(0x2a2838);
    for (let j = 0, y = -r; y < r; j++, y += 3) {
        for (let i = 0, x = -r; x < r; i++, x += 3) {
            if ((x + 1) ** 2 + (y + 1) ** 2 > (r - 1.5) ** 2) continue;
            ball.rect(cx + x, cy + y, 2, 2).fill(shades[(Math.floor(time * 1.5) + i + j * 2) % shades.length]);
        }
    }
    // twinkling pixel glints
    for (let k = 0; k < 2; k++) {
        if (Math.floor(time * 1.2 + k * 1.5) % 3 === 0) continue;
        const a = time * 0.5 + k * Math.PI;
        const gx = Math.round(cx + Math.cos(a) * 8), gy = Math.round(cy + Math.sin(a) * 8);
        ball.rect(gx - 2, gy, 5, 1).fill(0xffffff);
        ball.rect(gx, gy - 2, 1, 5).fill(0xffffff);
    }
}

function drawDancer(cx, feetY, px, beat, mirror, col) {
    const bi = Math.floor(beat);
    const flip = (bi % 2 === 0) !== (mirror < 0);
    const bounce = beat - bi < 0.25 ? px : 0;
    const x0 = Math.round(cx - (13 * px) / 2);
    const y0 = feetY - 16 * px - bounce;
    dancers.ellipse(cx, feetY, 7 * px, 2 * px).fill({ color: 0x000000, alpha: 0.5 });
    DANCER.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
            const ch = flip ? row[row.length - 1 - c] : row[c];
            if (ch === '.') continue;
            dancers.rect(x0 + c * px, y0 + r * px, px, px).fill(ch === 'k' ? 0x000000 : col);
        }
    });
}

function drawConfetti(dt) {
    confetti.clear();
    for (let n = 0; n < flakes.length; n++) {
        const p = flakes[n];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.flip += 0.03 * dt;
        if (p.y > H + 4) flakes[n] = newFlake(false);
        const wide = Math.floor(p.flip) % 2 === 0; // fake flip between 2x1 and 1x2
        confetti.rect(Math.round(p.x), Math.round(p.y), wide ? 2 : 1, wide ? 1 : 2).fill(p.c);
    }
}

function animateTitle(beat) {
    letters.forEach((t, i) => {
        t.y = t.baseY + Math.round(Math.sin(beat * Math.PI / 4 + i * 0.5) * 1.5);
        t.tint = color(i);
    });
}

function animateMenu(time) {
    buttons.forEach((t, i) => {
        t.tint = i === selected ? PALETTE[2] : 0x9d8fbf;
    });
    const t = buttons[selected];
    const ax = Math.round(t.x - t.width / 2 - 10);
    arrow.clear();
    if (Math.floor(time * 2) % 2 === 0) {
        arrow.poly([ax - 1, 165, ax + 4, 170, ax - 1, 175]).fill(PALETTE[2]);
    }
}

function animatePanel(time, dt) {
    panelT += ((panelOpen ? 1 : 0) - panelT) * Math.min(1, 0.25 * dt);
    panel.visible = panelT > 0.02;
    if (!panel.visible || !panelParts) return;
    const { dim, box, content, hint, bw, bh, bx, by } = panelParts;
    dim.alpha = Math.min(0.6, panelT);

    // the box grows open vertically, like an arcade dialog
    const h = Math.max(4, Math.round(bh * panelT));
    const y = Math.round(by + (bh - h) / 2);
    box.clear()
        .rect(bx, y, bw, h).fill(0x000000)
        .rect(bx + 1, y + 1, bw - 2, h - 2).stroke({ width: 2, color: color(current * 2) })
        .rect(bx + 4, y + 4, bw - 8, h - 8).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
    content.visible = panelOpen && panelT > 0.95;
    hint.visible = Math.floor(time * 2) % 2 === 0;
}

// Main loop

const start = performance.now();

app.ticker.add((ticker) => {
    const dt = ticker.deltaTime;
    const time = (performance.now() - start) / 1000;
    const beat = (time * BPM) / 60;
    const bi = Math.floor(beat);
    const pulse = (1 - (beat - bi)) ** 2;

    drawGlow(W / 2, 42);
    drawFloor(time, pulse);
    drawBeams(beat);
    drawReflections(time);

    dancers.clear();
    drawDancer(80, 154, 2, beat, -1, color(1));
    drawDancer(160, 154, 2, beat, 1, color(5));
    drawDancer(240, 154, 2, beat, -1, color(3));

    drawBall(W / 2, 42, time);
    drawConfetti(dt);
    pushStart.visible = Math.floor(time * 1.5) % 2 === 0;
    animateTitle(beat);
    animateMenu(time);
    animatePanel(time, dt);
});
