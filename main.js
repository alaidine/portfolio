import { BOY_HEAD, BOY_BODY, BOY_LEGS, BOY_COLORS, OUTLINE, drawSprite } from './sprites.js';

// Keyboard players need a mouse-like pointer and some room. Touch players need a landscape screen.
const coarse = () => matchMedia('(pointer: coarse)').matches;
const canPlayKeys = () => matchMedia('(hover: hover) and (pointer: fine)').matches && innerWidth >= 640 && innerHeight >= 400;
const canPlayTouch = () => coarse() && innerWidth > innerHeight && innerWidth >= 560 && innerHeight >= 280;
const canPlay = () => canPlayKeys() || canPlayTouch();

const playButton = document.getElementById('play');
const rotateHint = document.getElementById('rotate');
const infoButton = document.getElementById('to-info');
let game = null;
let starting = false;

// The game reads its text straight from the page sections
function readPages() {
    const section = (id) => {
        const el = document.getElementById(id);
        return { title: el.querySelector('h2').textContent.trim(), el };
    };
    return {
        about: section('about'),
        contact: section('contact'),
        projects: [...document.querySelectorAll('[data-project]')].map((el) => ({
            title: el.querySelector('h3').textContent.trim(),
            el,
        })),
    };
}

async function showGame() {
    const touch = !canPlayKeys() && canPlayTouch();
    document.body.classList.add('playing');
    document.body.classList.toggle('touch-play', touch);
    if (game) {
        game.resume();
        return;
    }
    if (starting) return;
    starting = true;
    try {
        const { startGame } = await import('./game.js');
        game = await startGame({
            pages: readPages(),
            mount: document.getElementById('screen'),
            dialogEl: document.getElementById('dialog'),
            touch,
        });
        window.__game = game;
    } catch (err) {
        console.error(err);
        showInfo();
    } finally {
        starting = false;
    }
}

function showInfo() {
    document.body.classList.remove('playing', 'touch-play');
    game?.pause();
}

playButton.addEventListener('click', showGame);
infoButton.addEventListener('click', () => {
    showInfo();
    scrollTo(0, 0);
    playButton.focus();
});

// On-screen buttons press and release keys in the game, several at once
for (const button of document.querySelectorAll('.touch [data-key]')) {
    const key = button.dataset.key;
    const release = () => {
        button.classList.remove('down');
        game?.input(key, false);
    };
    button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        button.classList.add('down');
        game?.input(key, true);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('contextmenu', (e) => e.preventDefault());
}

function onResize() {
    playButton.hidden = !canPlay();
    rotateHint.hidden = !(coarse() && !canPlay() && innerWidth < innerHeight);
    if (document.body.classList.contains('playing') && !canPlay()) showInfo();
}
addEventListener('resize', onResize);
onResize();

// Only keyboard players start in the game. Links like /#contact open straight on the page.
if (canPlayKeys() && !location.hash) showGame();

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
