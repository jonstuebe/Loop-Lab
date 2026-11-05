import {
  AmbientLight, BackSide, BoxGeometry, Color, DirectionalLight, Float32BufferAttribute, Fog,
  HemisphereLight, Mesh, NeutralToneMapping, MeshBasicMaterial, PerspectiveCamera, PMREMGenerator, Scene, SphereGeometry,
  SRGBColorSpace, WebGLRenderer,
} from 'three';

const HAZE = 0xf3dcc6;
const FOV = 72;
const NEAR = 0.02;
const FAR = 160;

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  /** The player's camera. */
  camera: PerspectiveCamera;
  /** Virtual camera used to render the view through each portal. */
  portalCamera: PerspectiveCamera;
  /** The shadow-casting key light. */
  sun: DirectionalLight;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  // MSAA happens in the post-processing render targets, so the default
  // framebuffer doesn't need its own.
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  // Khronos PBR Neutral keeps the toy-like palette saturated while rolling
  // highlights off, so sunlit cream panels no longer clip to flat white.
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.autoUpdate = false;

  const scene = new Scene();
  scene.background = new Color(HAZE);
  scene.fog = new Fog(HAZE, 40, 120);

  const aspect = window.innerWidth / window.innerHeight;
  const camera = new PerspectiveCamera(FOV, aspect, NEAR, FAR);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const portalCamera = new PerspectiveCamera(FOV, aspect, NEAR, FAR);

  scene.environment = createStudioEnvironment(renderer);
  scene.environmentIntensity = 0.8;

  scene.add(new HemisphereLight(0xdcecff, 0xf0c8a0, 0.75));
  scene.add(new AmbientLight(0xfff4e6, 0.15));

  const sun = new DirectionalLight(0xffe4c0, 1.9);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const fill = new DirectionalLight(0xa8ccff, 0.55);
  fill.position.set(-6, 3, -9);
  scene.add(fill);

  return { renderer, scene, camera, portalCamera, sun };
}

/**
 * A warm "studio" environment: a sky-to-floor gradient plus a few bright
 * softboxes, so glossy surfaces pick up crisp highlights instead of a flat sheen.
 */
function createStudioEnvironment(renderer: WebGLRenderer) {
  const envScene = new Scene();
  const geo = new SphereGeometry(10, 48, 24);
  const pos = geo.attributes.position;
  const top = new Color(0xcfe4ff);
  const mid = new Color(0xfff0dc);
  const bottom = new Color(0xd9a77c);
  const tmp = new Color();
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    if (y > 0) tmp.copy(mid).lerp(top, Math.pow(y, 0.7));
    else tmp.copy(mid).lerp(bottom, Math.pow(-y, 0.8));
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  envScene.add(new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));

  const boxGeo = new BoxGeometry(1, 1, 1);
  /** A thin glowing panel at (x,y,z), w × h, facing the origin. */
  const softbox = (color: number, strength: number, x: number, y: number, z: number, w: number, h: number) => {
    const mat = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(strength) });
    const m = new Mesh(boxGeo, mat);
    m.position.set(x, y, z);
    m.scale.set(w, h, 0.1);
    m.lookAt(0, 0, 0);
    envScene.add(m);
  };
  softbox(0xfff2e0, 5, 0.5, 8.5, 0.5, 6, 6); // overhead key
  softbox(0xffe1bf, 3, 8, 3, 4, 5, 3); // warm side
  softbox(0xbcd8ff, 2.2, -8, 2, -5, 4, 2.5); // cool side

  const pmrem = new PMREMGenerator(renderer);
  const texture = pmrem.fromScene(envScene, 0.035).texture;
  pmrem.dispose();
  envScene.traverse((o) => {
    if (o instanceof Mesh) (o.material as MeshBasicMaterial).dispose();
  });
  geo.dispose();
  boxGeo.dispose();
  return texture;
}
