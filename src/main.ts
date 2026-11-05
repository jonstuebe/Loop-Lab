import './styles.css';
import { Game } from './game';

const canvas = document.getElementById('c');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing game canvas #c');

const game = new Game(canvas);
game.start();

// Dev-only handle for poking at the game from the console (and for screenshots).
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
