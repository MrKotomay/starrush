export interface PlanetConfig {
  key: string;
  url: string;
  type: "image" | "spritesheet";
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  fps?: number;
  /**
   * Desired display size in CSS px. The loaded texture will be downscaled
   * to approximately this size so we never push a 4622px texture to the GPU.
   */
  displaySize: number;
  alpha: number;
  /** Parallax drift speed factor */
  speed: number;
  /** Vertical position as ratio of viewport height */
  yRatio: number;
  depth: number;
}

/*
 * Planet asset inventory (verified from /public/planets):
 *   gasgiant2.png    4622×3082  single image  (3:2 ratio)
 *   iceworld.png     1550×1034  single image  (3:2 ratio)
 *   lavaworld.png    1550×1034  single image  (3:2 ratio)
 *   noatmosphere.png 1550×1034  single image  (3:2 ratio)
 *   terraindry.png   1550×1034  single image  (3:2 ratio)
 *
 * None of these are spritesheets — no valid grid factorizations exist.
 * All are single-frame textures. They are loaded via this.load.image,
 * then downscaled into a small canvas texture at create() time to avoid
 * blowing the GPU's maxTextureSize on mobile devices.
 *
 * If a spritesheet planet is added later, set type:"spritesheet"
 * with proper frameWidth/frameHeight/frameCount/fps.
 */
export const PLANET_CONFIGS: PlanetConfig[] = [
  {
    key: "sr-planet-gasgiant",
    url: "/planets/gasgiant2.png",
    type: "image",
    displaySize: 160,
    alpha: 0.15,
    speed: 0.06,
    yRatio: 0.2,
    depth: 2,
  },
  {
    key: "sr-planet-lava",
    url: "/planets/lavaworld.png",
    type: "image",
    displaySize: 110,
    alpha: 0.12,
    speed: 0.10,
    yRatio: 0.65,
    depth: 3,
  },
  {
    key: "sr-planet-ice",
    url: "/planets/iceworld.png",
    type: "image",
    displaySize: 85,
    alpha: 0.10,
    speed: 0.08,
    yRatio: 0.35,
    depth: 3,
  },
  {
    key: "sr-planet-dry",
    url: "/planets/terraindry.png",
    type: "image",
    displaySize: 75,
    alpha: 0.09,
    speed: 0.11,
    yRatio: 0.78,
    depth: 4,
  },
  {
    key: "sr-planet-bare",
    url: "/planets/noatmosphere.png",
    type: "image",
    displaySize: 70,
    alpha: 0.08,
    speed: 0.07,
    yRatio: 0.48,
    depth: 2,
  },
];
