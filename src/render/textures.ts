import { CanvasTexture, RepeatWrapping, type Texture } from 'three';

type Draw = (g: CanvasRenderingContext2D, size: number) => void;

function makeTexture(draw: Draw, size = 256): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas context unavailable');
  draw(g, size);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  return tex;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

interface TileStyle {
  grout: string;
  top: string;
  bottom: string;
  highlight: string;
  shadow: string;
  inset: number;
  radius: number;
}

/** A single chunky rounded tile with a drop shadow and inner highlight. */
function drawTile(g: CanvasRenderingContext2D, s: number, t: TileStyle): void {
  const { inset, radius } = t;
  g.fillStyle = t.grout;
  g.fillRect(0, 0, s, s);
  roundRect(g, inset + 3, inset + 5, s - inset * 2, s - inset * 2, radius);
  g.fillStyle = t.shadow;
  g.fill();
  roundRect(g, inset, inset, s - inset * 2, s - inset * 2, radius);
  const grd = g.createLinearGradient(0, inset, 0, s - inset);
  grd.addColorStop(0, t.top);
  grd.addColorStop(1, t.bottom);
  g.fillStyle = grd;
  g.fill();
  g.save();
  roundRect(g, inset, inset, s - inset * 2, s - inset * 2, radius);
  g.clip();
  g.strokeStyle = t.highlight;
  g.lineWidth = 6;
  roundRect(g, inset + 3, inset + 3, s - inset * 2, s - inset * 2, radius);
  g.stroke();
  g.restore();
}

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

export interface GameTextures {
  white: Texture;
  metal: Texture;
  door: Texture;
  cube: Texture;
  cubeEmissive: Texture;
  all: Texture[];
}

export function createTextures(): GameTextures {
  const white = makeTexture((g, s) =>
    drawTile(g, s, {
      grout: '#dcc8b0', top: '#fffaf2', bottom: '#f1e3cf',
      highlight: 'rgba(255,255,255,.9)', shadow: 'rgba(150,110,70,.25)', inset: 9, radius: 30,
    }));

  const metal = makeTexture((g, s) => {
    drawTile(g, s, {
      grout: '#22344d', top: '#53749d', bottom: '#3b5880',
      highlight: 'rgba(160,200,255,.35)', shadow: 'rgba(0,0,0,.25)', inset: 10, radius: 34,
    });
    for (const [x, y] of [[34, 34], [s - 34, 34], [34, s - 34], [s - 34, s - 34]] as const) {
      circle(g, x, y, 7, '#7f9dc4');
    }
  });

  const door = makeTexture((g, s) => {
    drawTile(g, s, {
      grout: '#b98a1d', top: '#ffd866', bottom: '#ffbf2e',
      highlight: 'rgba(255,255,255,.6)', shadow: 'rgba(120,70,0,.3)', inset: 8, radius: 26,
    });
    g.save();
    roundRect(g, 8, 8, s - 16, s - 16, 26);
    g.clip();
    g.fillStyle = '#2f4766';
    for (let x = -s; x < s * 2; x += 56) {
      g.beginPath();
      g.moveTo(x, s);
      g.lineTo(x + 28, s);
      g.lineTo(x + 70, s * 0.78);
      g.lineTo(x + 42, s * 0.78);
      g.fill();
    }
    g.restore();
    g.fillStyle = 'rgba(47,71,102,.55)';
    roundRect(g, s * 0.47, 14, s * 0.06, s * 0.6, 8);
    g.fill();
  });

  const cube = makeTexture((g, s) => {
    g.fillStyle = '#2ec4b6';
    g.fillRect(0, 0, s, s);
    roundRect(g, 26, 26, s - 52, s - 52, 34);
    g.fillStyle = '#fff3e2';
    g.fill();
    circle(g, s / 2, s / 2, 54, '#2c2442');
    circle(g, s / 2, s / 2, 38, '#ffd36b');
  });

  const cubeEmissive = makeTexture((g, s) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    circle(g, s / 2, s / 2, 38, '#ffc23d');
  });

  return { white, metal, door, cube, cubeEmissive, all: [white, metal, door, cube, cubeEmissive] };
}
