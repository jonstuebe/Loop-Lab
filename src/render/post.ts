import { HalfFloatType, type PerspectiveCamera, type Scene, Vector2, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export interface PostSettings {
  /** MSAA sample count for the scene render; 0 disables it. */
  msaa: number;
  /** Ground-truth ambient occlusion. */
  ao: boolean;
  /** Glow around bright emissive things (portals, beacon, buttons). */
  bloom: boolean;
}

/**
 * The frame pipeline: scene → (AO) → (bloom) → tone mapping + sRGB.
 * Everything before the output pass stays linear HDR, which is also what
 * the portal render targets hold, so portal views match the main view.
 */
export class PostFX {
  private readonly composer: EffectComposer;
  private readonly ao: GTAOPass;
  private readonly bloom: UnrealBloomPass;
  private readonly size = new Vector2();

  constructor(private readonly renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    renderer.getDrawingBufferSize(this.size);
    const target = new WebGLRenderTarget(this.size.x, this.size.y, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);

    this.composer.addPass(new RenderPass(scene, camera));

    this.ao = new GTAOPass(scene, camera, this.size.x, this.size.y);
    this.ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.ao.blendIntensity = 0.85;
    this.composer.addPass(this.ao);

    // Threshold sits above lit-panel brightness so only emissives bloom.
    this.bloom = new UnrealBloomPass(new Vector2(this.size.x, this.size.y), 0.6, 0.45, 2.2);
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());
  }

  configure(settings: PostSettings): void {
    const max = this.renderer.capabilities.maxSamples;
    const samples = Math.min(settings.msaa, max);
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples === samples) continue;
      rt.samples = samples;
      rt.dispose(); // sample count is baked into the GPU buffers; force a rebuild
    }
    this.ao.enabled = settings.ao;
    this.bloom.enabled = settings.bloom;
    this.resize();
  }

  /** Call after the renderer's size or pixel ratio changes. */
  resize(): void {
    const ratio = this.renderer.getPixelRatio();
    this.renderer.getSize(this.size);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(this.size.x, this.size.y);
  }

  render(): void {
    this.composer.render();
  }
}
