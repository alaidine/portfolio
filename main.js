import { BOY_HEAD, BOY_BODY, BOY_LEGS, BOY_COLORS, OUTLINE, drawSprite } from './sprites.js';

// The game needs a keyboard, a mouse-like pointer and some room. Everyone else gets the page.
const canPlay = () => matchMedia('(hover: hover) and (pointer: fine)').matches && innerWidth >= 640 && innerHeight >= 400;

const playButton = document.getElementById('play');
const infoButton = document.getElementById('to-info');
let game = null;
let starting = false;

// Turns each [data-page] section into plain text for the in-game dialogs
function readPages() {
    return [...document.querySelectorAll('[data-page]')].map((section) => ({
        title: section.querySelector('h2').textContent.trim(),
        body: [...section.children]
            .filter((el) => el.tagName !== 'H2')
            .map((el) => (el.tagName === 'UL'
                ? [...el.children].map((li) => `- ${li.textContent.trim()}`).join('\n')
                : el.textContent.trim()))
            .join('\n\n'),
    }));
}

async function showGame() {
    document.body.classList.add('playing');
    if (game) {
        game.resume();
        return;
    }
    if (starting) return;
    starting = true;
    try {
        const { startGame } = await import('./game.js');
        game = await startGame({ pages: readPages(), mount: document.getElementById('screen') });
        window.__game = game;
    } catch (err) {
        console.error(err);
        showInfo();
    } finally {
        starting = false;
    }
}

function showInfo() {
    document.body.classList.remove('playing');
    game?.pause();
}

playButton.addEventListener('click', showGame);
infoButton.addEventListener('click', () => {
    showInfo();
    scrollTo(0, 0);
    playButton.focus();
});

function onResize() {
    playButton.hidden = !canPlay();
    if (document.body.classList.contains('playing') && !canPlay()) showInfo();
}
addEventListener('resize', onResize);
onResize();

// Links like /#contact open straight on the page
if (canPlay() && !location.hash) showGame();

// Rainbow, bouncing letters for the name
const name = document.querySelector('.name');
const COLORS = ['#ff77a8', '#ffa300', '#ffec27', '#00e436', '#29adff', '#b9a0ff'];
name.setAttribute('aria-label', name.textContent);
name.replaceChildren(...[...name.textContent].map((ch, i) => {
    const span = document.createElement('span');
    span.textContent = ch;
    span.setAttribute('aria-hidden', 'true');
    span.style.color = COLORS[i % COLORS.length];
    span.style.setProperty('--i', i);
    return span;
}));

// Little dancing mascot, the same sprite as in the game
const mascot = document.getElementById('mascot');
const ctx = mascot.getContext('2d');
const css = (c) => `#${c.toString(16).padStart(6, '0')}`;
const plot = (x, y, color) => {
    ctx.fillStyle = css(color);
    ctx.fillRect(x, y, 1, 1);
};
let beat = 0;
function dance() {
    ctx.clearRect(0, 0, mascot.width, mascot.height);
    const hop = beat % 2;
    const rows = [...BOY_HEAD, ...BOY_BODY[hop], ...BOY_LEGS[hop ? 3 : 0]];
    drawSprite(plot, rows, 1, 2 - hop, BOY_COLORS, { flip: beat % 4 >= 2, outline: OUTLINE });
    beat++;
}
dance();
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(dance, 300);
