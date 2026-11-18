import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ShaderEffect, useWebGPUDevice } from "@figma/expressive-components";
import {
  manifest,
  render,
  setup,
} from "./lib/custom-effects/CodeComponentId_bec10ead9897ac33dc09937b8e83356e5560d72f_0b3bafe361f941f39a50bf18be5681c2edaa314c";

type ShaderControls = {
  strength: number;
  swirl: number;
  dispersion: number;
  magnification: number;
  ripple: number;
  trail: number;
};

type Position = { x: number; y: number };

const ROTATION_CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

const DEFAULT_CONTROLS: ShaderControls = {
  strength: 3,
  swirl: 1.4,
  dispersion: 1,
  magnification: 14,
  ripple: 0.05,
  trail: 0.2,
};

const CONTROL_CONFIG: Array<{
  key: keyof ShaderControls;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "strength", label: "Strength", min: 0, max: 8, step: 0.1 },
  { key: "swirl", label: "Swirl", min: 0, max: 5, step: 0.1 },
  { key: "dispersion", label: "Dispersion", min: 0, max: 3, step: 0.05 },
  { key: "magnification", label: "Magnify", min: 0, max: 30, step: 0.5 },
  { key: "ripple", label: "Ripple", min: 0, max: 0.3, step: 0.01 },
  { key: "trail", label: "Trail", min: 0, max: 1, step: 0.01 },
];

const IMAGES = [
  {
    src: "/assets/3c491.png",
    alt: "Colorful design agency collage",
    className: "artwork artwork--agency",
    position: { x: -2.5, y: 4.5 },
  },
  {
    src: "/assets/b1ceb.png",
    alt: "Sunset music scene",
    className: "artwork artwork--music",
    position: { x: 7, y: 64 },
  },
  {
    src: "/assets/ef317.png",
    alt: "Editorial photography portfolio",
    className: "artwork artwork--photo",
    position: { x: 36, y: 22 },
  },
] as const;

function Artwork({
  src,
  alt,
  className,
  position,
  rotation,
  zIndex,
}: {
  src: string;
  alt: string;
  className: string;
  position: Position;
  rotation: number;
  zIndex: number;
}) {
  return (
    <div
      className={className}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        zIndex,
        transform: `rotate(${rotation}deg)`,
      }}
    >
      <img src={src} alt={alt} draggable={false} />
    </div>
  );
}

function DragHandle({
  alt,
  className,
  position,
  rotation,
  onPositionChange,
  onRotationChange,
  onActivate,
  zIndex,
}: {
  alt: string;
  className: string;
  position: Position;
  rotation: number;
  onPositionChange: (position: Position) => void;
  onRotationChange: (rotation: number) => void;
  onActivate: () => void;
  zIndex: number;
}) {
  const dragRef = useRef<{ pointerId: number; x: number; y: number; start: Position } | null>(null);
  const rotateRef = useRef<{
    pointerId: number;
    lastAngle: number;
    currentRotation: number;
    centerX: number;
    centerY: number;
  } | null>(null);

  const startDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = event.currentTarget.parentElement;
    if (!stage) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: position,
    };
    onActivate();
  };

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    const stage = event.currentTarget.parentElement;
    if (!start || start.pointerId !== event.pointerId || !stage) return;
    const bounds = stage.getBoundingClientRect();
    onPositionChange({
      x: start.start.x + ((event.clientX - start.x) / bounds.width) * 100,
      y: start.start.y + ((event.clientY - start.y) / bounds.height) * 100,
    });
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const startRotating = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const artwork = event.currentTarget.parentElement;
    if (!artwork) return;
    const bounds = artwork.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    event.currentTarget.setPointerCapture(event.pointerId);
    rotateRef.current = {
      pointerId: event.pointerId,
      lastAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      currentRotation: rotation,
      centerX,
      centerY,
    };
    onActivate();
  };

  const rotate = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const start = rotateRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const angle = Math.atan2(event.clientY - start.centerY, event.clientX - start.centerX);
    let angleDelta = angle - start.lastAngle;
    if (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
    if (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
    start.currentRotation += (angleDelta * 180) / Math.PI;
    start.lastAngle = angle;
    onRotationChange(start.currentRotation);
  };

  const stopRotating = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (rotateRef.current?.pointerId !== event.pointerId) return;
    rotateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className={className.replaceAll("artwork", "drag-handle")}
      onPointerDown={startDragging}
      onPointerMove={drag}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        zIndex,
        transform: `rotate(${rotation}deg)`,
      }}
      role="button"
      tabIndex={0}
      aria-label={`Drag ${alt}`}
    >
      <span className="drag-label">Drag</span>
      {ROTATION_CORNERS.map((corner) => (
        <span
          className={`rotate-handle rotate-handle--${corner}`}
          key={corner}
          onPointerDown={startRotating}
          onPointerMove={rotate}
          onPointerUp={stopRotating}
          onPointerCancel={stopRotating}
          title="Drag to rotate"
        />
      ))}
    </div>
  );
}

export default function App() {
  const [controls, setControls] = useState(DEFAULT_CONTROLS);
  const [positions, setPositions] = useState<Position[]>(() =>
    IMAGES.map((image) => ({ ...image.position })),
  );
  const [rotations, setRotations] = useState<number[]>(() => IMAGES.map(() => 0));
  const [activeImage, setActiveImage] = useState(2);
  const { device, error: gpuError } = useWebGPUDevice();
  const hasHtmlInCanvas =
    device !== null &&
    ("drawElementImageToTexture" in device.queue || "copyElementImageToTexture" in device.queue);
  const supportStatus = gpuError
    ? "webgpu-error"
    : device === null
      ? "checking"
      : hasHtmlInCanvas
        ? "ready"
        : "html-in-canvas-error";

  const updateControl = useCallback((key: keyof ShaderControls, value: number) => {
    setControls((current) => ({ ...current, [key]: value }));
  }, []);

  const shaderParams = useMemo(
    () => ({
      ripple: controls.ripple,
      gain: 1.5,
      stretchX: 1,
      refractionAngle: 0,
      highlightSharpness: 48,
      wobblePhase: 0,
      dispersion: controls.dispersion,
      swirl: controls.swirl,
      background: { r: 0.949, g: 0.949, b: 0.949, a: 1 },
      frostBlur: 0,
      highlightDirection: 0,
      strength: controls.strength,
      center: { x: 50, y: 50 },
      spectralGradient: {
        stops: [
          { position: 0, color: { r: 1, g: 0.1, b: 0.05, a: 1 } },
          { position: 0.5, color: { r: 0.1, g: 1, b: 0.2, a: 1 } },
          { position: 1, color: { r: 0.1, g: 0.2, b: 1, a: 1 } },
        ],
      },
      highlightBrightness: 1,
      focusRegion: { x: 50, y: 50, radius: 20 },
      phase: 0,
      spectralMode: 0,
      frostGrain: 0,
      glassStrength: 1,
      onset: 0.8,
      rim: 1.12,
      focusProtection: 0,
      blendAmount: 1,
      magnificationPower: controls.magnification,
      trail: controls.trail,
      wavelength: 0.3,
      swirlPhase: 0,
      focusSoftness: 15,
      stretchY: 1,
      spectralToneB: { r: 0.05, g: 0.3, b: 1, a: 1 },
      spectralToneA: { r: 1, g: 0.15, b: 0.05, a: 1 },
    }),
    [controls],
  );

  const shaderStack = useMemo(
    () => [
      {
        setup,
        render,
        manifest,
        params: shaderParams,
      },
    ],
    [shaderParams],
  );

  const reset = () => {
    setControls(DEFAULT_CONTROLS);
    setPositions(IMAGES.map((image) => ({ ...image.position })));
    setRotations(IMAGES.map(() => 0));
    setActiveImage(2);
  };

  return (
    <main className="app-shell">
      <header className="control-panel">
        <div className="brand">
          <div className="brand-row">
            <h1>Daddy Up</h1>
            <span className={`live-badge is-${supportStatus}`}>
              <span />
              {supportStatus === "ready"
                ? "GPU active"
                : supportStatus === "checking"
                  ? "Starting GPU"
                  : "GPU unavailable"}
            </span>
          </div>
          <p>Drag the images to refract the composition</p>
        </div>

        <div className="controls" aria-label="Shader controls">
          {CONTROL_CONFIG.map(({ key, label, min, max, step }) => (
            <label className="control" key={key}>
              <span className="control-heading">
                <span>{label}</span>
                <output>{controls[key].toFixed(step < 0.1 ? 2 : 1)}</output>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={controls[key]}
                onChange={(event) => updateControl(key, Number(event.target.value))}
              />
            </label>
          ))}
        </div>

        <div className="actions">
          <button className="reset-button" type="button" onClick={reset}>
            Reset
          </button>
        </div>
      </header>

      <section className="shader-stage" aria-label="Interactive Daddy Up shader canvas">
        <ShaderEffect className="shader-effect" shaders={shaderStack}>
          <div className="composition">
            {IMAGES.map((image, index) => (
              <Artwork
                key={image.src}
                src={image.src}
                alt={image.alt}
                className={image.className}
                position={positions[index]}
                rotation={rotations[index]}
                zIndex={activeImage === index ? 4 : index + 1}
              />
            ))}
          </div>
        </ShaderEffect>
        <div className="drag-layer">
          {IMAGES.map((image, index) => (
            <DragHandle
              key={image.src}
              alt={image.alt}
              className={image.className}
              position={positions[index]}
              rotation={rotations[index]}
              onPositionChange={(position) =>
                setPositions((current) =>
                  current.map((currentPosition, positionIndex) =>
                    positionIndex === index ? position : currentPosition,
                  ),
                )
              }
              onRotationChange={(rotation) =>
                setRotations((current) =>
                  current.map((currentRotation, rotationIndex) =>
                    rotationIndex === index ? rotation : currentRotation,
                  ),
                )
              }
              onActivate={() => setActiveImage(index)}
              zIndex={activeImage === index ? 4 : index + 1}
            />
          ))}
        </div>
        {(supportStatus === "webgpu-error" || supportStatus === "html-in-canvas-error") && (
          <div className="compatibility-notice" role="status">
            <strong>Shader preview unavailable</strong>
            <span>
              {supportStatus === "webgpu-error"
                ? "This browser does not expose WebGPU to the preview."
                : "This browser does not have HTML-in-Canvas enabled."}
            </span>
            <small>
              The exact Daddy Up shader is loaded, but both APIs are required to apply it to
              draggable HTML layers.
            </small>
          </div>
        )}
        <div className="stage-note" aria-hidden="true">
          <span className="cursor-mark">↖</span>
          Click and drag any image
        </div>
      </section>
    </main>
  );
}
