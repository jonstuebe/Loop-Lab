import './styles.css';
import { Game } from './game';

const canvas = document.getElementById('c');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing game canvas #c');

new Game(canvas).start();
