import {
  AmbientLight, BackSide, Color, ColorManagement, DirectionalLight, Float32BufferAttribute, Fog,
  HemisphereLight, LinearSRGBColorSpace, Mesh, MeshBasicMaterial, PerspectiveCamera, PMREMGenerator,
  Scene, SphereGeometry, WebGLRenderer,
} from 'three';

// The art was tuned for three.js' legacy (pre-r152) colour pipeline: hex colours
// are used as-is and the framebuffer is written without an sRGB transform.
ColorManagement.enabled = false;

/**
 * Light intensities were authored for three.js r128's legacy lighting model.
 * Since r155 lights use physical units (roughly a factor of π), and the
 * PBR/environment-map shading has shifted since then too. These factors were
 * calibrated by comparing renders against the original r128 build.
 */
const DIRECT_LIGHT_SCALE = Math.PI * 0.8;
const AMBIENT_LIGHT_SCALE = Math.PI * 0.6;

const HAZE = 0xf1d9c2;
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
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = LinearSRGBColorSpace;
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

  scene.add(new HemisphereLight(0xd6ebff, 0xf3c69c, 0.55 * AMBIENT_LIGHT_SCALE));
  scene.add(new AmbientLight(0xfff4e6, 0.12 * AMBIENT_LIGHT_SCALE));

  const sun = new DirectionalLight(0xffe0b5, 0.95 * DIRECT_LIGHT_SCALE);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const fill = new DirectionalLight(0x9cc4ff, 0.3 * DIRECT_LIGHT_SCALE);
  fill.position.set(-6, 3, -9);
  scene.add(fill);

  return { renderer, scene, camera, portalCamera, sun };
}

/** A soft gradient "studio" environment map for gentle reflections. */
function createStudioEnvironment(renderer: WebGLRenderer) {
  const envScene = new Scene();
  const geo = new SphereGeometry(10, 32, 16);
  const pos = geo.attributes.position;
  const top = new Color(0xcfe6ff);
  const mid = new Color(0xfff1df);
  const bottom = new Color(0xf0b98a);
  const tmp = new Color();
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    if (y > 0) tmp.copy(mid).lerp(top, y);
    else tmp.copy(mid).lerp(bottom, -y);
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  envScene.add(new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));

  const pmrem = new PMREMGenerator(renderer);
  const texture = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  geo.dispose();
  return texture;
}
