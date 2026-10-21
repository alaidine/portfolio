// Shared pixel art for the game and the info page mascot

// Player, facing right. Afro, no face, outlined at draw time.
// a/g = afro, s = skin, j = hoodie, p = jeans, o = sneakers
export const BOY_HEAD = [
    '..aaaaa..',
    '.agaaaga.',
    'aaaagaaaa',
    'agaaaaaga',
    'aaaasssss',
    'aaasssss.',
    '.aassss..',
];
// hoodie rows: hand in front, hand behind (swaps while running)
export const BOY_BODY = [
    ['...jjjj..', '...jjjjs.', '...jjjj..'],
    ['...jjjj..', '..sjjjj..', '...jjjj..'],
];
// legs + sneakers: standing, run A, run B, in the air
export const BOY_LEGS = [
    ['...p..p..', '...oo.oo.'],
    ['..p....p.', '.oo....oo'],
    ['....pp...', '....ooo..'],
    ['...p.p...', '..oo.oo..'],
];
export const BOY_COLORS = { a: 0x1a1210, g: 0x3a2a22, s: 0x7a4a2a, j: 0xf29a2e, p: 0x34508f, o: 0xf2efe6 };
export const OUTLINE = 0x0b0518;

// Draws a sprite through plot(x, y, color, alpha), so it works with Pixi and canvas 2D alike
export function drawSprite(plot, rows, x0, y0, colors, opts = {}) {
    const { flip = false, alpha = 1, shiftFrom = 99, shift = 0, outline } = opts;
    const at = (r, c) => {
        const row = rows[r];
        if (!row || c < 0 || c >= row.length) return undefined;
        return colors[flip ? row[row.length - 1 - c] : row[c]];
    };
    if (outline !== undefined) {
        for (let r = -1; r <= rows.length; r++) {
            for (let c = -1; c <= rows[0].length; c++) {
                if (at(r, c) !== undefined) continue;
                if (at(r - 1, c) !== undefined || at(r + 1, c) !== undefined || at(r, c - 1) !== undefined || at(r, c + 1) !== undefined) {
                    plot(x0 + c, y0 + r, outline, alpha);
                }
            }
        }
    }
    for (let r = 0; r < rows.length; r++) {
        const dx = r >= shiftFrom ? shift : 0;
        for (let c = 0; c < rows[r].length; c++) {
            const col = at(r, c);
            if (col !== undefined) plot(x0 + c + dx, y0 + r, col, alpha);
        }
    }
}
