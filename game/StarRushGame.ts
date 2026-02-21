import Phaser from "phaser";

import { RoundPhase, RoundSnapshot } from "@/game/types";
import { colors } from "@/theme/colors";

export interface RocketPose {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  visible: boolean;
}

/* ── texture keys ─────────────────────────────────────── */
const DOT_KEY = "sr-dot";
const IS_DEV = process.env.NODE_ENV !== "production";
const PLANET_FRAME_WIDTH = 255;
const PLANET_FRAME_HEIGHT = 255;
const PLANET_FRAME_MARGIN = 3;
const PLANET_FRAME_SPACING = 3;
const PLANET_FRAME_COUNT = 24;
const PLANET_SPAWN_MIN_MS = 10_000;
const PLANET_SPAWN_MAX_MS = 15_000;
const PLANET_START_DELAY_MS = 3_000;
const PLANET_DEPTH_FACTOR_MIN = 0.25;
const PLANET_DEPTH_FACTOR_MAX = 0.45;
const BG_TOP = 0x06112a;
const BG_BOTTOM = 0x08142e;
const BG_GRADIENT_STEPS = 28;

const STAR_DEPTH_FAR = 6;
const STAR_DEPTH_MID = 8;
const PLANET_DEPTH = 9.5;
const STAR_DEPTH_NEAR = 12;
const NEBULA_DEPTH = 4.5;
const METEOR_DEPTH = 11.5;

const PLANET_ALPHA_FAR = 0.36;
const PLANET_ALPHA_NEAR = 0.84;
const PLANET_TINT_FAR = { r: 85, g: 96, b: 128 };
const PLANET_TINT_NEAR = { r: 201, g: 214, b: 255 };
const STAR_SCROLL_BASE = 185;
const STAR_AVG_SPEED_FACTOR = 0.57;
const METEOR_MIN_INTERVAL_MS = 3200;
const METEOR_MAX_INTERVAL_MS = 7600;

const TRAIL_COLORS = [0xff6bd6, 0xd06bff, 0x8ba5ff, 0xff8ed4];
const BURST_COLORS = [0xff52cc, 0xff8bcf, 0xc592ff, 0x7ab0ff, 0xffffff];
const PLANET_POOL = [
  { key: "sr-planet-lava", url: "/planets/lavaworld.png", anim: "lava_spin" },
  { key: "sr-planet-ice", url: "/planets/iceworld.png", anim: "ice_spin" },
  { key: "sr-planet-terrain", url: "/planets/terraindry.png", anim: "terrain_spin" },
  { key: "sr-planet-noa", url: "/planets/noatmosphere.png", anim: "noa_spin" },
] as const;

/* ── helper interfaces ────────────────────────────────── */
interface StarObj {
  sprite: Phaser.GameObjects.Image;
  speed: number;
  baseSize: number;
  baseAlpha: number;
  twinkle: number;
}

interface PlanetObj {
  sprite: Phaser.GameObjects.Sprite;
  depthFactor: number;
  verticalDrift: number;
  rotSpeed: number;
  radius: number;
}

interface TrailP {
  sprite: Phaser.GameObjects.Rectangle;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  sn: number; // speedNorm at spawn
}

interface BurstP {
  sprite: Phaser.GameObjects.Image;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
}

interface NebulaObj {
  sprite: Phaser.GameObjects.Ellipse;
  baseX: number;
  baseY: number;
  ampX: number;
  ampY: number;
  driftSpeed: number;
  baseAlpha: number;
  phase: number;
}

interface MeteorObj {
  sprite: Phaser.GameObjects.Rectangle;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  baseWidth: number;
  baseHeight: number;
}

interface StarRushSceneOptions {
  debugSync?: boolean;
}

interface StarRushGameOptions {
  debugSync?: boolean;
}

function lerpColor(from: number, to: number, t: number): number {
  const fr = (from >> 16) & 255;
  const fg = (from >> 8) & 255;
  const fb = from & 255;
  const tr = (to >> 16) & 255;
  const tg = (to >> 8) & 255;
  const tb = to & 255;
  return Phaser.Display.Color.GetColor(
    Math.round(Phaser.Math.Linear(fr, tr, t)),
    Math.round(Phaser.Math.Linear(fg, tg, t)),
    Math.round(Phaser.Math.Linear(fb, tb, t)),
  );
}

/* ================================================================
   StarRush Phaser Scene
   – Rocket anchored at center; background + VFX create speed feel
   ================================================================ */
class StarRushScene extends Phaser.Scene {
  /* ── state ────────────────────────────────────────────── */
  private phase: RoundPhase = RoundPhase.PREPARING;
  private roundId = "round-0";
  private crashAt = 2;
  private targetCoeff = 1;
  private displayCoeff = 1;
  private runningElapsedMs = 0;

  private ready = false;
  private pending: RoundSnapshot | null = null;
  private lowPower = false;
  private crashDoneRound: string | null = null;

  private vw = 1;
  private vh = 1;

  /* ── layers ───────────────────────────────────────────── */
  private bg!: Phaser.GameObjects.Graphics;
  private nebulas: NebulaObj[] = [];
  private stars: StarObj[] = [];
  private meteors: MeteorObj[] = [];
  private planets: PlanetObj[] = [];

  /* ── rocket ───────────────────────────────────────────── */
  private rocket!: Phaser.GameObjects.Sprite;
  private glow!: Phaser.GameObjects.Ellipse;
  private halo!: Phaser.GameObjects.Ellipse;
  private readonly rocketPose: RocketPose = {
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    visible: false,
  };

  /* ── crash VFX ────────────────────────────────────────── */
  private shockwave!: Phaser.GameObjects.Arc;
  private flash!: Phaser.GameObjects.Ellipse;
  private trails: TrailP[] = [];
  private bursts: BurstP[] = [];
  private trailCur = 0;
  private burstCur = 0;
  private trailAcc = 0;
  private smoothStarInt = 0.32;
  private bgSpeed = STAR_SCROLL_BASE * STAR_AVG_SPEED_FACTOR * 0.32;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private autoLowPower = false;
  private planetSpawnStartEvent: Phaser.Time.TimerEvent | null = null;
  private planetSpawnLoopEvent: Phaser.Time.TimerEvent | null = null;
  private activeTrailCount = 0;
  private activeBurstCount = 0;
  private meteorCur = 0;
  private meteorCooldownMs = 1800;
  private readonly debugSync: boolean;

  constructor(options: StarRushSceneOptions = {}) {
    super("StarRushScene");
    this.debugSync = Boolean(options.debugSync);
  }

  /* ── lifecycle ────────────────────────────────────────── */
  preload(): void {
    for (const planet of PLANET_POOL) {
      this.load.spritesheet(planet.key, planet.url, {
        frameWidth: PLANET_FRAME_WIDTH,
        frameHeight: PLANET_FRAME_HEIGHT,
        margin: PLANET_FRAME_MARGIN,
        spacing: PLANET_FRAME_SPACING,
        endFrame: PLANET_FRAME_COUNT - 1,
      });
    }
  }

  create(): void {
    this.vw = Math.max(1, this.scale.width);
    this.vh = Math.max(1, this.scale.height);
    this.makeDot();
    this.buildBg();
    this.buildNebulas();
    this.buildStars();
    this.buildMeteors(4);
    this.buildPlanetAnimations();
    this.startPlanetSpawner();
    this.buildRocket();
    this.buildTrails(36);
    this.buildBursts(24);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.onResize({
      width: this.scale.width,
      height: this.scale.height,
    } as Phaser.Structs.Size);

    this.ready = true;
    if (this.pending) {
      const s = this.pending;
      this.pending = null;
      this.debugLog(`scene ready, apply queued snapshot round=${s.roundId} phase=${s.phase}`);
      this.applySnapshot(s);
    } else {
      this.resetRound();
      this.debugLog("scene ready, no queued snapshot -> reset");
    }
  }

  update(_t: number, rawDelta: number): void {
    if (!this.ready) return;
    const dt = Math.min(rawDelta, 50) / 1000;

    // auto low-power: if average FPS < 48 over 90 frames, reduce effects
    this.fpsFrames++;
    this.fpsAccum += rawDelta;
    if (this.fpsFrames >= 90) {
      const avgMs = this.fpsAccum / this.fpsFrames;
      this.autoLowPower = avgMs > 21; // < ~48 fps
      this.fpsFrames = 0;
      this.fpsAccum = 0;
    }

    this.lerpCoeff();
    this.tickNebulas(dt);
    this.tickStars(dt);
    this.tickMeteors(dt);
    this.tickPlanets(dt);
    this.tickRocket(dt);
    this.tickTrails(dt);
    this.tickBursts(dt);
  }

  /* ── public API ───────────────────────────────────────── */
  applySnapshot(snap: RoundSnapshot): void {
    if (!this.ready) {
      this.pending = { ...snap };
      this.debugLog(
        `queue snapshot (scene not ready) round=${snap.roundId} phase=${snap.phase} coeff=${snap.coefficient.toFixed(4)}`,
      );
      return;
    }

    const prevPhase = this.phase;
    const prevRound = this.roundId;

    this.phase = snap.phase;
    this.roundId = snap.roundId;
    this.crashAt = Math.max(1.01, snap.crashAt);
    this.targetCoeff = Math.max(1, snap.coefficient);
    this.runningElapsedMs = snap.runningElapsedMs;

    this.debugLog(
      `apply snapshot round=${snap.roundId} phase=${snap.phase} coeff=${snap.coefficient.toFixed(4)} crashAt=${snap.crashAt.toFixed(2)}`,
    );
    this.applyPhaseTransition(prevRound, prevPhase, snap);
  }

  resize(w: number, h: number): void {
    this.vw = Math.max(1, w);
    this.vh = Math.max(1, h);
    this.redrawBg();
  }

  setLowPowerMode(on: boolean): void {
    this.lowPower = on;
  }

  isReady(): boolean {
    return this.ready;
  }

  getRocketPose(): RocketPose {
    return this.rocketPose;
  }

  destroyScene(): void {
    this.scale?.off?.(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.tweens?.killAll();
    this.planetSpawnStartEvent?.remove(false);
    this.planetSpawnStartEvent = null;
    this.planetSpawnLoopEvent?.remove(false);
    this.planetSpawnLoopEvent = null;
    for (const planet of this.planets) {
      planet.sprite.destroy();
    }
    this.planets.length = 0;
    for (const nebula of this.nebulas) {
      nebula.sprite.destroy();
    }
    this.nebulas.length = 0;
    for (const meteor of this.meteors) {
      meteor.sprite.destroy();
    }
    this.meteors.length = 0;
    this.rocketPose.visible = false;
  }

  private applyPhaseTransition(
    prevRoundId: string,
    prevPhase: RoundPhase,
    snap: RoundSnapshot,
  ): void {
    const roundChanged = prevRoundId !== snap.roundId;
    const phaseChanged = prevPhase !== snap.phase;

    if (roundChanged) {
      this.crashDoneRound = null;
    }

    if (snap.phase === RoundPhase.PREPARING) {
      if (roundChanged || phaseChanged || this.rocketPose.visible) {
        this.resetRound();
        this.debugLog(`transition reset round=${snap.roundId} phase=PREPARING`);
      }
      return;
    }

    if (snap.phase === RoundPhase.RUNNING) {
      if (roundChanged || phaseChanged) {
        this.clearCrashVFX();
        this.trailAcc = 0;
        this.debugLog(`transition startRun round=${snap.roundId}`);
      }
      return;
    }

    if (snap.phase === RoundPhase.CRASHED) {
      if (this.crashDoneRound !== snap.roundId) {
        this.targetCoeff = snap.crashAt;
        this.displayCoeff = snap.crashAt;
        this.doCrash();
        this.crashDoneRound = snap.roundId;
        this.debugLog(`transition crash round=${snap.roundId} crashAt=${snap.crashAt.toFixed(2)}`);
      }
      return;
    }

    if (snap.phase === RoundPhase.RESETTING && (roundChanged || phaseChanged)) {
      this.debugLog(`transition resetting round=${snap.roundId}`);
    }
  }

  private debugLog(message: string): void {
    if (!this.debugSync) return;
    console.debug(`[StarRushScene] ${message}`);
  }

  /* ── internals ────────────────────────────────────────── */
  private onResize(sz: Phaser.Structs.Size): void {
    this.resize(sz.width, sz.height);
  }

  private makeDot(): void {
    if (this.textures.exists(DOT_KEY)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture(DOT_KEY, 8, 8);
    g.destroy();
  }

  private get effectsLow(): boolean {
    return this.lowPower || this.autoLowPower;
  }

  /* ── background ───────────────────────────────────────── */
  private buildBg(): void {
    this.bg = this.add.graphics().setDepth(0);
  }

  private buildNebulas(): void {
    const w = Math.max(this.scale.width, 360);
    const h = Math.max(this.scale.height, 320);
    const palette = [0x1f4fff, 0x6f45ff, 0x1f8dff];
    const nebulaCount = 3;
    for (let i = 0; i < nebulaCount; i += 1) {
      const color = palette[i % palette.length];
      const sprite = this.add
        .ellipse(-120, -120, w * Phaser.Math.FloatBetween(0.6, 1.05), h * Phaser.Math.FloatBetween(0.3, 0.62), color, 0)
        .setDepth(NEBULA_DEPTH)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(true);
      this.nebulas.push({
        sprite,
        baseX: Phaser.Math.Between(-Math.floor(w * 0.1), Math.floor(w * 1.1)),
        baseY: Phaser.Math.Between(-Math.floor(h * 0.05), Math.floor(h * 1.05)),
        ampX: Phaser.Math.FloatBetween(16, 42),
        ampY: Phaser.Math.FloatBetween(10, 28),
        driftSpeed: Phaser.Math.FloatBetween(0.22, 0.47),
        baseAlpha: Phaser.Math.FloatBetween(0.024, 0.05),
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private buildMeteors(count: number): void {
    this.meteorCur = 0;
    this.meteorCooldownMs = Phaser.Math.Between(METEOR_MIN_INTERVAL_MS, METEOR_MAX_INTERVAL_MS);
    for (let i = 0; i < count; i += 1) {
      const sprite = this.add
        .rectangle(-200, -200, 56, 2, 0xcfdcff, 0)
        .setDepth(METEOR_DEPTH)
        .setOrigin(0.5, 0.5)
        .setVisible(false);
      this.meteors.push({
        sprite,
        life: 0,
        maxLife: 0,
        vx: 0,
        vy: 0,
        baseWidth: 56,
        baseHeight: 2,
      });
    }
  }

  private redrawBg(): void {
    if (!this.cameras?.main) return;
    const { vw: w, vh: h } = this;
    this.cameras.main
      .setViewport(0, 0, w, h)
      .setBounds(0, 0, w, h)
      .setBackgroundColor(BG_BOTTOM);

    this.bg.clear();
    for (let i = 0; i < BG_GRADIENT_STEPS; i += 1) {
      const yStart = Math.floor((h * i) / BG_GRADIENT_STEPS);
      const yEnd = Math.floor((h * (i + 1)) / BG_GRADIENT_STEPS);
      const stripeHeight = Math.max(1, yEnd - yStart);
      const t = BG_GRADIENT_STEPS <= 1 ? 1 : i / (BG_GRADIENT_STEPS - 1);
      this.bg.fillStyle(lerpColor(BG_TOP, BG_BOTTOM, t), 1);
      this.bg.fillRect(0, yStart, w, stripeHeight);
    }

    for (const nebula of this.nebulas) {
      if (nebula.baseX < -w * 0.35 || nebula.baseX > w * 1.35) {
        nebula.baseX = Phaser.Math.Between(-Math.floor(w * 0.15), Math.floor(w * 1.15));
      }
      if (nebula.baseY < -h * 0.35 || nebula.baseY > h * 1.35) {
        nebula.baseY = Phaser.Math.Between(-Math.floor(h * 0.1), Math.floor(h * 1.1));
      }
    }

    for (const s of this.stars) {
      if (s.sprite.x > w) s.sprite.x = Phaser.Math.Between(0, w);
      if (s.sprite.y > h) s.sprite.y = Phaser.Math.Between(0, h);
    }
  }

  /* ── stars (3 parallax layers) ────────────────────────── */
  private buildStars(): void {
    this.starLayer(30, 0.25, 1.0, 2.0, 0.18, 0.38, [0x7e8bff, 0xb989ff], STAR_DEPTH_FAR);
    this.starLayer(35, 0.55, 1.5, 2.6, 0.28, 0.58, [0xff6ecf, 0xaf8eff, 0x8aa7ff], STAR_DEPTH_MID);
    this.starLayer(20, 0.92, 2.0, 3.4, 0.38, 0.74, [0xff89db, 0xc39dff, 0xaec5ff, 0xffffff], STAR_DEPTH_NEAR);
  }

  private starLayer(
    n: number,
    spd: number,
    szMin: number,
    szMax: number,
    aMin: number,
    aMax: number,
    colors: number[],
    depth: number,
  ): void {
    const w = Math.max(this.scale.width, 360);
    const h = Math.max(this.scale.height, 320);
    for (let i = 0; i < n; i++) {
      const sz = Phaser.Math.FloatBetween(szMin, szMax);
      const a = Phaser.Math.FloatBetween(aMin, aMax);
      const c = colors[Math.floor(Math.random() * colors.length)];
      const sp = this.add
        .image(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), DOT_KEY)
        .setDepth(depth)
        .setTint(c)
        .setAlpha(a);
      sp.displayWidth = sz;
      sp.displayHeight = sz;
      this.stars.push({ sprite: sp, speed: spd, baseSize: sz, baseAlpha: a, twinkle: Math.random() * 6.28 });
    }
  }

  /* ── planets: animations + manager ───────────────────── */
  private buildPlanetAnimations(): void {
    for (const planet of PLANET_POOL) {
      if (!this.anims.exists(planet.anim)) {
        this.anims.create({
          key: planet.anim,
          frames: this.anims.generateFrameNumbers(planet.key, {
            start: 0,
            end: PLANET_FRAME_COUNT - 1,
          }),
          frameRate: 4,
          repeat: -1,
        });
      }
    }
  }

  private startPlanetSpawner(): void {
    this.planetSpawnStartEvent?.remove(false);
    this.planetSpawnLoopEvent?.remove(false);

    this.planetSpawnStartEvent = this.time.addEvent({
      delay: PLANET_START_DELAY_MS,
      callback: () => {
        this.trySpawnPlanet();
        this.scheduleNextPlanetSpawnAttempt();
      },
    });
  }

  private scheduleNextPlanetSpawnAttempt(): void {
    this.planetSpawnLoopEvent?.remove(false);
    this.planetSpawnLoopEvent = this.time.addEvent({
      delay: Phaser.Math.Between(PLANET_SPAWN_MIN_MS, PLANET_SPAWN_MAX_MS),
      callback: () => {
        this.trySpawnPlanet();
        this.scheduleNextPlanetSpawnAttempt();
      },
    });
  }

  private trySpawnPlanet(): void {
    if (this.planets.length > 0) return;
    this.spawnPlanet();
  }

  private spawnPlanet(): void {
    const planet = PLANET_POOL[Math.floor(Math.random() * PLANET_POOL.length)];
    const frameIndex = Phaser.Math.Between(0, PLANET_FRAME_COUNT - 1);
    const scale = Phaser.Math.FloatBetween(0.22, 0.45);
    const radius = (PLANET_FRAME_WIDTH * scale) / 2;
    const x = this.vw + radius + Phaser.Math.Between(20, 120);
    const yMin = radius;
    const yMax = Math.max(radius, this.vh - radius);
    const y = Phaser.Math.FloatBetween(yMin, yMax);
    const depthFactor = Phaser.Math.Clamp(
      Phaser.Math.FloatBetween(PLANET_DEPTH_FACTOR_MIN, PLANET_DEPTH_FACTOR_MAX),
      PLANET_DEPTH_FACTOR_MIN,
      PLANET_DEPTH_FACTOR_MAX,
    );

    const sprite = this.add
      .sprite(x, y, planet.key, frameIndex)
      .setDepth(PLANET_DEPTH)
      .setScale(scale)
      .setAlpha(PLANET_ALPHA_NEAR)
      .setTint(0xffffff)
      .setBlendMode(Phaser.BlendModes.NORMAL);

    this.applyPlanetDepthVisuals(sprite, depthFactor);

    const frame = sprite.frame;
    if (!frame) {
      throw new Error(`[StarRush] Planet frame is undefined for ${planet.key}`);
    }
    if (frame.width !== PLANET_FRAME_WIDTH || frame.height !== PLANET_FRAME_HEIGHT) {
      throw new Error(
        `[StarRush] Invalid planet frame size for ${planet.key}: ${frame.width}x${frame.height}`,
      );
    }

    if (IS_DEV) {
      console.debug(
        `[StarRush][planet-spawn] planetKey=${planet.key} frameIndex=${frameIndex} frameName=${String(frame.name)} textureKey=${sprite.texture.key}`,
      );
    }

    this.planets.push({
      sprite,
      depthFactor,
      verticalDrift: Phaser.Math.FloatBetween(-8, 8),
      rotSpeed: Phaser.Math.FloatBetween(-0.25, 0.25),
      radius,
    });
  }

  private applyPlanetDepthVisuals(sprite: Phaser.GameObjects.Sprite, depthFactor: number): void {
    const depthRange = Math.max(PLANET_DEPTH_FACTOR_MAX - PLANET_DEPTH_FACTOR_MIN, 0.0001);
    const depth01 = Phaser.Math.Clamp((depthFactor - PLANET_DEPTH_FACTOR_MIN) / depthRange, 0, 1);
    const easedDepth = Math.pow(depth01, 0.75);
    const alpha = Phaser.Math.Linear(PLANET_ALPHA_FAR, PLANET_ALPHA_NEAR, easedDepth);
    const tint = Phaser.Display.Color.GetColor(
      Math.round(Phaser.Math.Linear(PLANET_TINT_FAR.r, PLANET_TINT_NEAR.r, easedDepth)),
      Math.round(Phaser.Math.Linear(PLANET_TINT_FAR.g, PLANET_TINT_NEAR.g, easedDepth)),
      Math.round(Phaser.Math.Linear(PLANET_TINT_FAR.b, PLANET_TINT_NEAR.b, easedDepth)),
    );

    sprite.setAlpha(alpha).setTint(tint);
  }

  /* ── rocket + VFX objects ─────────────────────────────── */
  private buildRocket(): void {
    this.rocket = this.add.sprite(0, 0, DOT_KEY, 0).setDepth(24);
    this.rocket.setScale(6).setTint(0xff7de7);
    this.rocket.setVisible(false).setAlpha(0);

    this.glow = this.add
      .ellipse(0, 0, 140, 85, 0xff5fd7, 0.2)
      .setDepth(22);

    this.halo = this.add
      .ellipse(0, 0, 55, 55, 0xab7eff, 0.3)
      .setDepth(23);

    this.shockwave = this.add
      .circle(0, 0, 20)
      .setDepth(30)
      .setFillStyle(0x000000, 0)
      .setStrokeStyle(3, 0xffb0fa, 0.95)
      .setVisible(false);

    this.flash = this.add
      .ellipse(0, 0, 96, 96, 0xffb4fa, 0)
      .setDepth(29)
      .setVisible(false);
  }

  private buildTrails(count: number): void {
    for (let i = 0; i < count; i++) {
      const s = this.add
        .rectangle(-120, -120, 4, 4, 0xff73e0, 0)
        .setDepth(18)
        .setVisible(false);
      this.trails.push({ sprite: s, life: 0, maxLife: 0, vx: 0, vy: 0, sn: 0 });
    }
  }

  private buildBursts(count: number): void {
    for (let i = 0; i < count; i++) {
      const s = this.add
        .image(-120, -120, DOT_KEY)
        .setDepth(28)
        .setVisible(false);
      this.bursts.push({ sprite: s, life: 0, maxLife: 0, vx: 0, vy: 0 });
    }
  }

  /* ── round lifecycle ──────────────────────────────────── */
  private resetRound(): void {
    this.displayCoeff = 1;
    this.targetCoeff = 1;
    this.trailAcc = 0;

    const rx = this.vw * 0.5;
    const ry = this.vh * 0.44;
    this.rocket.setVisible(false).setAlpha(0).setPosition(rx, ry).setRotation(Phaser.Math.DegToRad(45));
    this.glow.setVisible(false).setAlpha(0).setPosition(rx, ry);
    this.halo.setVisible(false).setAlpha(0).setPosition(rx, ry);
    this.rocketPose.x = rx;
    this.rocketPose.y = ry;
    this.rocketPose.rotation = this.rocket.rotation;
    this.rocketPose.scale = this.rocket.scaleX;
    this.rocketPose.visible = false;

    this.smoothStarInt = 0.32;

    this.clearCrashVFX();
    this.killParticles();
  }

  private clearCrashVFX(): void {
    this.shockwave.setVisible(false).setAlpha(0);
    this.flash.setVisible(false).setAlpha(0);
  }

  private killParticles(): void {
    for (const p of this.trails) { p.life = 0; p.sprite.setVisible(false); }
    for (const p of this.bursts) { p.life = 0; p.sprite.setVisible(false); }
    this.activeTrailCount = 0;
    this.activeBurstCount = 0;
  }

  /* ── per-frame: coefficient smoothing ─────────────────── */
  private lerpCoeff(): void {
    if (this.phase !== RoundPhase.RUNNING) {
      this.displayCoeff = this.targetCoeff;
      return;
    }
    const blend = this.effectsLow ? 0.08 : 0.18;
    this.displayCoeff = Phaser.Math.Linear(this.displayCoeff, this.targetCoeff, blend);
    if (Math.abs(this.displayCoeff - this.targetCoeff) < 0.001) {
      this.displayCoeff = this.targetCoeff;
    }
  }

  /* ── per-frame: stars ─────────────────────────────────── */
  private tickNebulas(dt: number): void {
    if (this.nebulas.length === 0) return;

    const now = this.time.now * 0.001;
    const runBoost =
      this.phase === RoundPhase.RUNNING ? Phaser.Math.Clamp((this.displayCoeff - 1) / 6, 0, 1) : 0;
    const targetAlphaMul = this.effectsLow ? 0.72 : 1 + runBoost * 0.35;

    for (const nebula of this.nebulas) {
      const x = nebula.baseX + Math.sin(now * nebula.driftSpeed + nebula.phase) * nebula.ampX;
      const y = nebula.baseY + Math.cos(now * (nebula.driftSpeed * 0.73) + nebula.phase) * nebula.ampY;
      nebula.sprite.setPosition(x, y);

      const pulse = 0.5 + Math.sin(now * (0.22 + nebula.driftSpeed * 0.3) + nebula.phase * 1.7) * 0.5;
      const targetAlpha = nebula.baseAlpha * targetAlphaMul + pulse * 0.016;
      nebula.sprite.alpha = Phaser.Math.Linear(
        nebula.sprite.alpha,
        Phaser.Math.Clamp(targetAlpha, 0.014, 0.095),
        Math.min(1, dt * 2.2),
      );
    }
  }

  private spawnMeteor(): void {
    if (this.meteors.length === 0) return;

    const m = this.meteors[this.meteorCur];
    this.meteorCur = (this.meteorCur + 1) % this.meteors.length;

    const angle = Phaser.Math.DegToRad(Phaser.Math.Between(150, 168));
    const speed = Phaser.Math.FloatBetween(240, 420);
    const startX = Phaser.Math.Between(Math.floor(this.vw * 0.45), this.vw + 84);
    const startY = Phaser.Math.Between(-44, Math.floor(this.vh * 0.42));
    const width = Phaser.Math.Between(46, 88);
    const height = Phaser.Math.FloatBetween(1.6, 2.8);
    const lifeMs = Phaser.Math.Between(560, 920);

    m.life = lifeMs;
    m.maxLife = lifeMs;
    m.vx = Math.cos(angle) * speed;
    m.vy = Math.sin(angle) * speed;
    m.baseWidth = width;
    m.baseHeight = height;
    m.sprite
      .setPosition(startX, startY)
      .setRotation(angle)
      .setSize(width, height)
      .setDisplaySize(width, height)
      .setFillStyle(0xdde6ff, 1)
      .setAlpha(0)
      .setVisible(true);
  }

  private tickMeteors(dt: number): void {
    if (this.meteors.length === 0) return;

    if (!this.effectsLow) {
      this.meteorCooldownMs -= dt * 1000;
      if (this.meteorCooldownMs <= 0) {
        this.spawnMeteor();
        this.meteorCooldownMs = Phaser.Math.Between(METEOR_MIN_INTERVAL_MS, METEOR_MAX_INTERVAL_MS);
      }
    } else if (this.meteorCooldownMs < 1400) {
      this.meteorCooldownMs = 1400;
    }

    const runStretch =
      this.phase === RoundPhase.RUNNING ? Phaser.Math.Clamp((this.displayCoeff - 1) / 7, 0, 1) : 0;

    for (const m of this.meteors) {
      if (m.life <= 0) continue;

      m.life -= dt * 1000;
      if (
        m.life <= 0 ||
        m.sprite.x < -160 ||
        m.sprite.x > this.vw + 160 ||
        m.sprite.y < -120 ||
        m.sprite.y > this.vh + 160
      ) {
        m.life = 0;
        m.sprite.setVisible(false);
        continue;
      }

      m.sprite.x += m.vx * dt;
      m.sprite.y += m.vy * dt;

      const life01 = m.maxLife > 0 ? Phaser.Math.Clamp(m.life / m.maxLife, 0, 1) : 0;
      const fadeIn = Math.min(1, (1 - life01) * 3.5);
      const fadeOut = Math.min(1, life01 * 2.4);
      const alpha = 0.06 + fadeIn * fadeOut * (this.effectsLow ? 0.24 : 0.52);
      const trailStretch = 1 + runStretch * 0.28 + (1 - life01) * 0.22;

      m.sprite.setAlpha(alpha);
      m.sprite.displayWidth = m.baseWidth * trailStretch;
      m.sprite.displayHeight = m.baseHeight;
    }
  }

  private tickStars(dt: number): void {
    const isRunning = this.phase === RoundPhase.RUNNING;
    const targetInt = isRunning
      ? 1 + Math.log(Math.max(this.displayCoeff, 1)) * 1.6
      : 0.32;
    this.smoothStarInt += (targetInt - this.smoothStarInt) * Math.min(1, dt * 1.8);
    const intensity = this.smoothStarInt;
    this.bgSpeed = STAR_SCROLL_BASE * STAR_AVG_SPEED_FACTOR * intensity;
    const highSpd = Phaser.Math.Clamp((intensity - 1.2) / 3.5, 0, 1);

    for (let i = 0; i < this.stars.length; i++) {
      if (this.effectsLow && i % 2 === 1) continue;
      const s = this.stars[i];

      // scroll right → left
      s.sprite.x -= s.speed * intensity * dt * STAR_SCROLL_BASE;

      // wrap
      if (s.sprite.x < -30) {
        s.sprite.x = this.vw + Phaser.Math.Between(10, 90);
        s.sprite.y = Phaser.Math.Between(0, this.vh);
      }

      // twinkle
      const tw = Math.sin(this.time.now * 0.002 + s.twinkle) * 0.12;
      s.sprite.alpha = Phaser.Math.Clamp(s.baseAlpha + tw, 0.05, 1);

      // trail stretching at high speed (>3x multiplier region)
      const stretch = 1 + highSpd * 6 * s.speed;
      s.sprite.displayWidth = s.baseSize * stretch;
      s.sprite.displayHeight = s.baseSize * (1 - highSpd * 0.35);
    }
  }

  /* ── per-frame: planets ───────────────────────────────── */
  private tickPlanets(dt: number): void {
    if (this.planets.length > 1) {
      for (let i = 1; i < this.planets.length; i += 1) {
        this.planets[i].sprite.destroy();
      }
      this.planets.splice(1);
    }

    for (let i = this.planets.length - 1; i >= 0; i -= 1) {
      const planet = this.planets[i];
      const depthFactor = Number.isFinite(planet.depthFactor)
        ? Phaser.Math.Clamp(planet.depthFactor, PLANET_DEPTH_FACTOR_MIN, PLANET_DEPTH_FACTOR_MAX)
        : PLANET_DEPTH_FACTOR_MIN;
      planet.depthFactor = depthFactor;

      planet.sprite.x -= this.bgSpeed * depthFactor * dt;
      planet.sprite.y += planet.verticalDrift * dt;
      planet.sprite.rotation += planet.rotSpeed * dt;

      if (planet.sprite.x < -planet.radius - 200) {
        planet.sprite.destroy();
        this.planets.splice(i, 1);
      }
    }
  }

  /* ── per-frame: rocket ────────────────────────────────── */
  private tickRocket(dt: number): void {
    // visible only during RUNNING
    if (this.phase !== RoundPhase.RUNNING) {
      if (this.rocket.visible) this.rocket.setVisible(false);
      if (this.glow.visible) this.glow.setVisible(false);
      if (this.halo.visible) this.halo.setVisible(false);
      this.rocketPose.visible = false;
      return;
    }

    // anchor position — center of game area
    const ax = this.vw * 0.5;
    const ay = this.vh * 0.44;

    // gentle hover bobble
    const bob = Math.sin(this.time.now * 0.003) * 3;
    const sway = Math.sin(this.time.now * 0.0019) * 2;
    const x = ax + sway;
    const y = ay + bob;

    const c = Math.max(1, this.displayCoeff);
    const linear = Phaser.Math.Clamp((c - 1) / 8, 0, 1);
    const aggr = linear * linear; // quadratic ease — gentle start, aggressive later

    // Keep a fixed rocket angle (no multiplier-based tilt).
    const targetAngle = Phaser.Math.DegToRad(45);

    // glow intensifies
    this.glow.setAlpha(0.2 + aggr * 0.22);
    this.glow.width = 140 + aggr * 65;
    this.glow.height = 85 + aggr * 42;
    this.halo.setAlpha(0.3 + aggr * 0.22);
    this.halo.width = 55 + aggr * 20;
    this.halo.height = 55 + aggr * 20;

    // fixed orientation
    const rot = targetAngle;

    this.rocket.setVisible(false).setAlpha(0).setPosition(x, y).setRotation(rot);
    this.glow.setVisible(true).setPosition(x, y);
    this.halo.setVisible(true).setPosition(x, y);
    this.rocketPose.x = x;
    this.rocketPose.y = y;
    this.rocketPose.rotation = rot;
    this.rocketPose.scale = this.rocket.scaleX;
    this.rocketPose.visible = true;

    // exhaust trails only at higher speed and with strict per-frame caps
    if (this.displayCoeff > 1.22) {
      const sn = Phaser.Math.Clamp((this.displayCoeff - 1) / 4, 0, 1);
      const rate = this.effectsLow ? 8 + sn * 10 : 14 + sn * 24;
      this.trailAcc += dt * rate;
      let spawned = 0;
      const spawnCap = this.effectsLow ? 2 : 3;
      while (this.trailAcc >= 1 && spawned < spawnCap) {
        this.spawnTrail(x, y, sn);
        this.trailAcc -= 1;
        spawned += 1;
      }
      if (this.trailAcc > 2) this.trailAcc = 2;
    }
  }

  /* ── trail particles ──────────────────────────────────── */
  private spawnTrail(rx: number, ry: number, sn: number): void {
    const p = this.trails[this.trailCur];
    this.trailCur = (this.trailCur + 1) % this.trails.length;

    const h = this.rocket.rotation;
    const td = 44;
    const tx = rx - Math.cos(h) * td;
    const ty = ry - Math.sin(h) * td;

    const spread = Phaser.Math.FloatBetween(-0.3, 0.3);
    const dir = h + Math.PI + spread;
    const imp = Phaser.Math.FloatBetween(38, 115 + sn * 105);

    p.life = Phaser.Math.Between(170, 340) - sn * 70;
    p.maxLife = p.life;
    p.vx = Math.cos(dir) * imp;
    p.vy = Math.sin(dir) * imp + Phaser.Math.FloatBetween(-22, 22);
    p.sn = sn;

    const c = TRAIL_COLORS[Math.floor(Math.random() * TRAIL_COLORS.length)];
    p.sprite
      .setVisible(true)
      .setFillStyle(c, 0.85)
      .setPosition(tx, ty)
      .setRotation(dir)
      .setAlpha(0.86);
    p.sprite.setSize(3 + sn * 14, Math.max(1.4, 3 - sn));
  }

  private tickTrails(dt: number): void {
    let active = 0;
    for (const p of this.trails) {
      if (p.life <= 0) continue;
      active += 1;
      p.life -= dt * 1000;
      if (p.life <= 0) { p.life = 0; p.sprite.setVisible(false); continue; }
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      const r = p.life / p.maxLife;
      const st = 1 + p.sn * (1 - r) * 4.2;
      p.sprite.displayWidth = (2.8 + p.sn * 11) * st;
      p.sprite.displayHeight = Math.max(1.1, 2.2 - p.sn * 0.8);
      p.sprite.alpha = r * (0.74 + p.sn * 0.2);
    }
    this.activeTrailCount = active;
  }

  /* ── crash VFX ────────────────────────────────────────── */
  private doCrash(): void {
    const x = this.rocket.x;
    const y = this.rocket.y;

    this.rocket.setVisible(false);
    this.glow.setVisible(false);
    this.halo.setVisible(false);
    this.rocketPose.visible = false;
    this.trailAcc = 0;

    // camera shake
    if (this.cameras?.main) this.cameras.main.shake(200, 0.006);

    // shockwave ring
    this.shockwave
      .setVisible(true)
      .setAlpha(0.92)
      .setScale(0.2)
      .setPosition(x, y);

    this.tweens.add({
      targets: this.shockwave,
      scale: 2.6,
      alpha: 0,
      duration: 420,
      ease: "Cubic.Out",
      onComplete: () => this.shockwave.setVisible(false),
    });

    // flash burst
    this.flash
      .setVisible(true)
      .setPosition(x, y)
      .setScale(0.2)
      .setAlpha(0.95);

    this.tweens.add({
      targets: this.flash,
      scale: 3,
      alpha: 0,
      duration: 300,
      ease: "Sine.Out",
      onComplete: () => this.flash.setVisible(false),
    });

    // particle burst
    const n = this.effectsLow ? 10 : 18;
    for (let i = 0; i < n; i++) {
      const bp = this.bursts[this.burstCur];
      this.burstCur = (this.burstCur + 1) % this.bursts.length;

      const ang = (Math.PI * 2 * i) / n + Phaser.Math.FloatBetween(-0.12, 0.12);
      const spd = Phaser.Math.FloatBetween(80, 245);

      bp.life = Phaser.Math.Between(240, 600);
      bp.maxLife = bp.life;
      bp.vx = Math.cos(ang) * spd;
      bp.vy = Math.sin(ang) * spd;

      const c = BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)];
      const sz = Phaser.Math.FloatBetween(3, 10);
      bp.sprite
        .setVisible(true)
        .setPosition(x, y)
        .setTint(c)
        .setAlpha(0.96);
      bp.sprite.displayWidth = sz;
      bp.sprite.displayHeight = sz;
    }
  }

  private tickBursts(dt: number): void {
    let active = 0;
    for (const p of this.bursts) {
      if (p.life <= 0) continue;
      active += 1;
      p.life -= dt * 1000;
      if (p.life <= 0) { p.life = 0; p.sprite.setVisible(false); continue; }
      p.vx *= 0.982;
      p.vy = p.vy * 0.982 + 16 * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      const r = p.life / p.maxLife;
      p.sprite.alpha = r;
      p.sprite.displayWidth *= 0.993 + r * 0.008;
      p.sprite.displayHeight = p.sprite.displayWidth;
    }
    this.activeBurstCount = active;
  }

}

/* ================================================================
   StarRushGame — Phaser wrapper
   ================================================================ */
export class StarRushGame {
  private readonly game: Phaser.Game;
  private readonly scene: StarRushScene;
  private destroyed = false;

  constructor(parent: HTMLElement, options: StarRushGameOptions = {}) {
    this.scene = new StarRushScene({ debugSync: options.debugSync });
    this.game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent,
      backgroundColor: colors.surfaceAlt,
      transparent: true,
      scene: [this.scene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: parent.clientWidth || 360,
        height: parent.clientHeight || 320,
      },
      render: {
        antialias: true,
        powerPreference: "high-performance",
      },
      fps: { target: 60, forceSetTimeOut: false },
      audio: { noAudio: true },
    });
  }

  applySnapshot(snap: RoundSnapshot): void {
    this.scene.applySnapshot(snap);
  }

  resize(w: number, h: number): void {
    if (this.destroyed || !this.scene.isReady()) return;
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    const sw = Math.floor(w);
    const sh = Math.floor(h);
    if (sw < 2 || sh < 2) return;

    try {
      this.game.scale.resize(sw, sh);
      this.scene.resize(sw, sh);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Framebuffer status: Incomplete Attachment")) {
        throw error;
      }
      if (IS_DEV) {
        console.warn("[StarRushGame] Skip unstable WebGL resize", { sw, sh, message });
      }
    }
  }

  setLowPowerMode(on: boolean): void {
    this.scene.setLowPowerMode(on);
  }

  getRocketPose(): RocketPose {
    return this.scene.getRocketPose();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.destroyScene();
    this.game.destroy(true);
  }
}


