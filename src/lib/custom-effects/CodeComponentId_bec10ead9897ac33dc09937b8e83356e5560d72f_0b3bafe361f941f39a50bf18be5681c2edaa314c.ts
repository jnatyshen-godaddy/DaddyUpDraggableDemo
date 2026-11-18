// @ts-nocheck

// Property metadata is only used in Figma Design, so this is a no-op.
function defineProperties(
  _component: unknown,
  _properties: unknown,
): void {}

export default function Effect() { }
export function setup(device, frame) {
    var wgsl = `
diagnostic(off,derivative_uniformity);
struct Uniforms {
  frameData: vec4f,
  inputDimsData: vec4f,
  strength: vec4f,
  rim: vec4f,
  dispersion: vec4f,
  trail: vec4f,
  swirl: vec4f,
  ripple: vec4f,
  wavelength: vec4f,
  onset: vec4f,
  phase: vec4f,
  glassStrength: vec4f,
  background: vec4f,
  center: vec4f,
  magnificationPower: vec4f,
  gain: vec4f,
  directionData: vec4f,
  finishData: vec4f,
  lightingData: vec4f,
  focus: vec4f,
  focusData: vec4f,
  toneA: vec4f,
  toneB: vec4f,
  spectralColors: array<vec4f, 8>,
  spectralPositions: array<vec4f, 2>,
  spectralCount: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;

struct VsIn {
  @location(0) pos: vec2f,
  @location(1) uv: vec2f,
};
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

fn sampleInput(p: vec2f) -> vec4f {
  return textureSampleLevel(inputTex, samp, clamp(p, vec2f(0.0), vec2f(1.0)), 0.0);
}

// Like sampleInput but returns transparent (premultiplied zero) outside the
// input rect instead of repeating the edge texel.
fn sampleInputOrZero(p: vec2f) -> vec4f {
  let inside = step(vec2f(0.0), p) * step(p, vec2f(1.0));
  return sampleInput(p) * (inside.x * inside.y);
}

fn lensMag(q: vec2f, r: f32, radii: vec2f, unitSize: f32, cfg: vec4f, rimStart: f32, ripPhase: f32) -> f32 {

  let rn = length(q / max(radii, vec2f(0.0001)));

  let bend = cfg.x * pow(clamp(rn, 0.0, 1.6), max(cfg.y, 0.001));

  let oscillation = sin(6.28318 * r / max(cfg.w * unitSize, 0.0001) - ripPhase);

  let rippleOn = select(0.0, 1.0, cfg.w > 0.000001);

  return max(1.0 + bend + cfg.z * rippleOn * oscillation * smoothstep(min(rimStart, 0.9999), 1.0, rn), 0.35);

}

fn spectralWeight(x: f32) -> vec3f {

  let red1 = (x - 0.08) / 0.26;

  let red2 = (x - 1.0) / 0.12;

  let green = (x - 0.46) / 0.24;

  let blue = (x - 0.82) / 0.22;

  return vec3f(exp(-red1 * red1) + 0.35 * exp(-red2 * red2), exp(-green * green), exp(-blue * blue));

}

fn lensHash(p: vec2f) -> f32 {

  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);

}

fn spectralRamp(t: f32) -> vec4f {
  let count = clamp(i32(u.spectralCount.x), 1, 8);
  var result = u.spectralColors[0];
  for (var j = 1; j < 8; j += 1) {
    if (j >= count) { break; }
    let prev = u.spectralPositions[(j - 1) / 4][(j - 1) % 4];
    let next = u.spectralPositions[j / 4][j % 4];
    let fraction = clamp((t - prev) / max(next - prev, 0.000001), 0.0, 1.0);
    result = mix(result, u.spectralColors[j], fraction);
  }
  return result;
}

@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}

@fragment fn fs_main(@location(0) outputUv_in: vec2f) -> @location(0) vec4f {
  let time = u.frameData.x;
  let outputUv = outputUv_in;
  let dims = max(u.frameData.yz, vec2f(1.0));
  let inputDims = max(u.inputDimsData.xy, vec2f(1.0));
  let inputTexel = vec2f(1.0) / inputDims;
  let uv = outputUv;
  // texel and aspect are input-relative to match uv. Zoom fills rescale texel
  // alongside their uv redefinition below (see zoomLocal).
  let texel = inputTexel;
  let aspect = inputDims.x / max(inputDims.y, 1.0);
  let strength = u.strength.x;
  let rim = u.rim.x;
  let dispersion = u.dispersion.x;
  let trail = u.trail.x;
  let swirl = u.swirl.x;
  let ripple = u.ripple.x;
  let wavelength = u.wavelength.x;
  let onset = u.onset.x;
  let phase = u.phase.x;
  let glassStrength = u.glassStrength.x;
  let background = u.background;
  let center = u.center.xy;
  let magnificationPower = u.magnificationPower.x;
  let gain = u.gain.x;
  let inputColor = sampleInput(uv);
  if (u.finishData.y <= 0.0) { return inputColor; }
  // Use the source's bottom-left geometry, then flip back only for sampling.
  // Coordinate space is points, independent of export/render resolution.
   let size = dims / max(u.frameData.w, 0.0001);
  let px = vec2f(uv.x, 1.0 - uv.y) * size;
  let c = vec2f(center.x, 100.0 - center.y) * 0.01 * size;
  let radii = size * 0.5 * max(rim, 0.0001);
  let unitSize = max(min(size.x, size.y), 0.0001);
  let cfg = vec4f(strength, magnificationPower, ripple, wavelength);
  var q = px - c;
  var r = length(q);
  let dispRaw = 1.0 / lensMag(q, r, radii, unitSize, cfg, onset, phase) - 1.0;
  let glassMask = smoothstep(0.03, 0.35, -dispRaw) * glassStrength;
  // Phase is the source ripple phase; wobble time is frozen at phase / ripDrift.
   let staticTime = phase / 1.1 + u.finishData.w;
  let wob = vec2f(sin(px.y * 11.0 / unitSize + staticTime * 1.3) + sin(px.x * 7.0 / unitSize - staticTime * 0.9), cos(px.x * 9.0 / unitSize + staticTime * 1.1) + sin(px.y * 6.0 / unitSize + staticTime * 0.7));
  q += wob * unitSize * 0.012 * glassMask;
  r = length(q);
  let uncapped = 1.0 / lensMag(q, r, radii, unitSize, cfg, onset, phase) - 1.0;
  let cap = max(trail, 0.0);
  let disp = -cap * (1.0 - exp(-max(-uncapped, 0.0) / max(cap, 0.000001)));
   let dither = lensHash(floor(px) + vec2f(0.5));
   let refracted = smoothstep(0.0, 0.08, abs(disp));
   let directionAngle = radians(u.directionData.z);
   let directionCos = cos(directionAngle);
   let directionSin = sin(directionAngle);
  var col = vec3f(0.0);
  var cov = vec3f(0.0);
  var wsum = vec3f(0.0);
  for (var i = 0; i < 48; i += 1) {
    let lam = (f32(i) + dither) / 48.0;
     var w = spectralWeight(lam);
     if (u.finishData.z > 0.5) {
       var tint = mix(u.toneA, u.toneB, lam);
       if (u.finishData.z > 1.5) { tint = spectralRamp(lam); }
       w = tint.rgb * tint.a;
     }
    let k = 1.0 + disp * (1.0 + dispersion * (2.0 * lam - 1.0));
     let sw = (swirl * lam + u.lightingData.w) * -disp;
    let qr = vec2f(q.x * cos(sw) - q.y * sin(sw), q.x * sin(sw) + q.y * cos(sw));
     let delta = (c + qr * k - px) * u.directionData.xy;
     let directed = vec2f(delta.x * directionCos - delta.y * directionSin, delta.x * directionSin + delta.y * directionCos);
     // One deterministic disk offset per existing wavelength sample: still 48 reads.
     // Point-space radius preserves the blur across export/render scales.
     let diskAngle = f32(i) * 2.39996323 + dither * 6.2831853;
     let diskRadius = sqrt((f32(i) + 0.5) / 48.0) * u.directionData.w * refracted;
     let frostOffset = vec2f(cos(diskAngle), sin(diskAngle)) * diskRadius;
     let sourceUv = (px + directed + frostOffset) / size;
    // Figma input is already premultiplied: do not multiply sample RGB by alpha again.
    let smp = sampleInputOrZero(vec2f(sourceUv.x, 1.0 - sourceUv.y));
    col += smp.rgb * w;
    cov += smp.a * w;
    wsum += w;
  }
  col /= max(wsum, vec3f(0.0001));
  cov /= max(wsum, vec3f(0.0001));
  let cov2 = min(cov * gain, vec3f(1.0));
  col = col * cov2 / max(cov, vec3f(0.0001));
  let paperCoverage = (vec3f(1.0) - cov2) * background.a;
  var outc = background.rgb * paperCoverage + col;
  // Scalar alpha must encompass all spectral channel coverages for valid premultiplication.
  let channelAlpha = cov2 + paperCoverage;
  let alpha = max(channelAlpha.r, max(channelAlpha.g, channelAlpha.b));
  let e = 2.0;
  let rr = max(r, 1.0);
  let rp = rr + e;
  let rm = max(rr - e, 0.0);
  let hp = -(1.0 / lensMag(q * rp / rr, rp, radii, unitSize, cfg, onset, phase) - 1.0);
  let hm = -(1.0 / lensMag(q * rm / rr, rm, radii, unitSize, cfg, onset, phase) - 1.0);
  let slope = clamp((hp - hm) / (2.0 * e) * unitSize * 0.35, -2.5, 2.5);
  let nrm = normalize(vec3f(-slope * q / rr, 1.0));
   let lightAngle = radians(u.lightingData.x);
   let lightDir = normalize(vec3f(-0.45 * cos(lightAngle) - 0.55 * sin(lightAngle), -0.45 * sin(lightAngle) + 0.55 * cos(lightAngle), 0.7));
  let halfDir = normalize(lightDir + vec3f(0.0, 0.0, 1.0));
   let spec = pow(max(dot(nrm, halfDir), 0.0), max(u.lightingData.z, 1.0));
  let fres = pow(1.0 - max(nrm.z, 0.0), 1.5);
  let onPhoto = smoothstep(0.0, 0.3, max(cov2.r, max(cov2.g, cov2.b)));
  outc = mix(outc, outc * vec3f(0.89, 0.915, 0.97), fres * glassStrength * onPhoto);
   outc += vec3f(spec) * 0.85 * glassStrength * smoothstep(0.0, 0.25, fres) * onPhoto * u.lightingData.y;
   let grain = (lensHash(floor(px * 1.7) + vec2f(91.7, 43.1)) - 0.5) * u.finishData.x * refracted;
   outc += vec3f(grain * alpha);
   let focusCenter = u.focus.xy * 0.01 * size;
   let focusDistance = length(uv * size - focusCenter);
   let focusRadius = u.focus.z * 0.01 * unitSize;
   let focusSoftness = max(u.focusData.x * 0.01 * unitSize, 0.0001);
   let edgeTreatment = smoothstep(focusRadius, focusRadius + focusSoftness, focusDistance);
   let focusMix = mix(1.0, edgeTreatment, clamp(u.focus.w, 0.0, 1.0));
   let treated = vec4f(clamp(outc, vec3f(0.0), vec3f(alpha)), alpha);
   return mix(inputColor, treated, clamp(u.finishData.y, 0.0, 1.0) * focusMix);
}
`;
    frame.state.module = device.createShaderModule({ code: wgsl });
    frame.state.pipeline = null;
    frame.state.pipelineFormat = null;
    frame.state.quad = device.createBuffer({
        size: 6 * 4 * 4,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Float32Array(frame.state.quad.getMappedRange()).set([
        -1, -1, 0, 1,
        1, -1, 1, 1,
        -1, 1, 0, 0,
        -1, 1, 0, 0,
        1, -1, 1, 1,
        1, 1, 1, 0,
    ]);
    frame.state.quad.unmap();
    frame.state.uniformBuf = device.createBuffer({
        size: 544,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    frame.state.sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
    });
    frame.state.placeholder = device.createTexture({
        size: [1, 1, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: frame.state.placeholder }, new Uint8Array([0, 0, 0, 0]), { bytesPerRow: 4 }, { width: 1, height: 1, depthOrArrayLayers: 1 });
}
export function render(device, frame) {
    var params = frame.params || {};
    function finiteNumber(value, fallback) {
        var num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }
    function numberParam(name, fallback) {
        return finiteNumber(params[name], fallback);
    }
    function boolParam(name, fallback) {
        if (typeof params[name] === 'boolean')
            return params[name] ? 1 : 0;
        return fallback ? 1 : 0;
    }
    function selectParam(name, count, fallbackIndex) {
        // A select is a numeric dropdown: params[name] is the chosen option's index.
        var index = Math.round(Number(params[name]));
        return Number.isFinite(index) && index >= 0 && index < count ? index : fallbackIndex;
    }
    function colorParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.r, fallback[0]),
            finiteNumber(value.g, fallback[1]),
            finiteNumber(value.b, fallback[2]),
            finiteNumber(value.a, fallback[3]),
        ];
    }
    function pointParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.x, fallback[0]),
            finiteNumber(value.y, fallback[1]),
        ];
    }
    function pointRadiusParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.x, fallback[0]),
            finiteNumber(value.y, fallback[1]),
            finiteNumber(value.radius, fallback[2]),
        ];
    }
    function pointPointLineParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.x, fallback[0]),
            finiteNumber(value.y, fallback[1]),
            finiteNumber(value.x2, fallback[2]),
            finiteNumber(value.y2, fallback[3]),
        ];
    }
    function pointAngleRadiusParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.x, fallback[0]),
            finiteNumber(value.y, fallback[1]),
            finiteNumber(value.radius, fallback[2]),
            finiteNumber(value.angle, fallback[3]),
        ];
    }
    function colorPointParam(name, fallback) {
        var value = params[name] || {};
        var color = value.color || {};
        return [
            finiteNumber(value.x, fallback[0]),
            finiteNumber(value.y, fallback[1]),
            0,
            0,
            finiteNumber(color.r, fallback[2]),
            finiteNumber(color.g, fallback[3]),
            finiteNumber(color.b, fallback[4]),
            finiteNumber(color.a, fallback[5]),
        ];
    }
    function gradientParam(name, fallback) {
        var value = params[name] || {};
        var stops = Array.isArray(value.stops) && value.stops.length > 0 ? value.stops : fallback;
        // Layout: 8 stop colors (rgba), then 8 positions packed 4-per-vec4, then the live count.
        var out = new Array(44).fill(0);
        var count = Math.min(stops.length, 8);
        for (var i = 0; i < count; i++) {
            var stop = stops[i] || {};
            var color = stop.color || {};
            out[i * 4] = finiteNumber(color.r, 0);
            out[i * 4 + 1] = finiteNumber(color.g, 0);
            out[i * 4 + 2] = finiteNumber(color.b, 0);
            out[i * 4 + 3] = finiteNumber(color.a, 1);
            out[32 + i] = finiteNumber(stop.position, 0);
        }
        out[40] = count;
        return out;
    }
    var output = frame.output || {};
    var width = Math.max(1, finiteNumber(output.physicalWidth, finiteNumber(output.width, 1)));
    var height = Math.max(1, finiteNumber(output.physicalHeight, finiteNumber(output.height, 1)));
    var renderScale = Math.max(0.0001, finiteNumber(frame.renderScale, 1));
    var time = 0;
    var inputWidth = width;
    var inputHeight = height;
    device.queue.writeBuffer(frame.state.uniformBuf, 0, new Float32Array([
        time, width, height, renderScale,
        inputWidth, inputHeight, 0, 0,
        numberParam("strength", 3), 0, 0, 0,
        numberParam("rim", 1.12), 0, 0, 0,
        numberParam("dispersion", 1), 0, 0, 0,
        numberParam("trail", 0.2), 0, 0, 0,
        numberParam("swirl", 1.4), 0, 0, 0,
        numberParam("ripple", 0.05), 0, 0, 0,
        numberParam("wavelength", 0.3), 0, 0, 0,
        numberParam("onset", 0.8), 0, 0, 0,
        numberParam("phase", 0), 0, 0, 0,
        numberParam("glassStrength", 1), 0, 0, 0,
        ...colorParam("background", [0.949, 0.949, 0.949, 1]),
        ...pointParam("center", [50, 50]), 0, 0,
        numberParam("magnificationPower", 14), 0, 0, 0,
        numberParam("gain", 1.5), 0, 0, 0,
        numberParam("stretchX", 1), numberParam("stretchY", 1), numberParam("refractionAngle", 0), numberParam("frostBlur", 0),
        numberParam("frostGrain", 0), numberParam("blendAmount", 1), selectParam("spectralMode", 3, 0), numberParam("wobblePhase", 0),
        numberParam("highlightDirection", 0), numberParam("highlightBrightness", 1), numberParam("highlightSharpness", 48), numberParam("swirlPhase", 0),
        ...pointRadiusParam("focusRegion", [50, 50, 20]), numberParam("focusProtection", 0),
        numberParam("focusSoftness", 15), 0, 0, 0,
        ...colorParam("spectralToneA", [1, 0.15, 0.05, 1]),
        ...colorParam("spectralToneB", [0.05, 0.3, 1, 1]),
        ...gradientParam("spectralGradient", [
            { position: 0, color: { r: 1, g: 0.1, b: 0.05, a: 1 } },
            { position: 0.5, color: { r: 0.1, g: 1, b: 0.2, a: 1 } },
            { position: 1, color: { r: 0.1, g: 0.2, b: 1, a: 1 } },
        ]),
    ]));
    var inputView = frame.input != null
        ? frame.input.createView()
        : frame.state.placeholder.createView();
    var outputFormat = frame.output.format;
    if (frame.state.pipeline == null || frame.state.pipelineFormat !== outputFormat) {
        frame.state.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: frame.state.module,
                entryPoint: 'vs_main',
                buffers: [{
                        arrayStride: 16,
                        attributes: [
                            { shaderLocation: 0, format: 'float32x2', offset: 0 },
                            { shaderLocation: 1, format: 'float32x2', offset: 8 },
                        ],
                    }],
            },
            fragment: {
                module: frame.state.module,
                entryPoint: 'fs_main',
                targets: [{ format: outputFormat }],
            },
            primitive: { topology: 'triangle-list' },
        });
        frame.state.pipelineFormat = outputFormat;
    }
    var bindGroup = device.createBindGroup({
        layout: frame.state.pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: frame.state.uniformBuf } },
            { binding: 1, resource: frame.state.sampler },
            { binding: 2, resource: inputView },
        ],
    });
    var encoder = device.createCommandEncoder();
    var pass = encoder.beginRenderPass({
        colorAttachments: [{
                view: frame.output.createView(),
                loadOp: 'clear',
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                storeOp: 'store',
            }],
    });
    pass.setPipeline(frame.state.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, frame.state.quad);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
}
defineProperties(Effect, {
    stretchX: { type: "number", label: "Horizontal stretch", defaultValue: 1, control: "slider", min: 0, max: 3, step: 0.01 },
    stretchY: { type: "number", label: "Vertical stretch", defaultValue: 1, control: "slider", min: 0, max: 3, step: 0.01 },
    refractionAngle: { type: "number", label: "Refraction angle", defaultValue: 0, control: "slider", min: -180, max: 180, step: 1, unit: "°" },
    frostBlur: { type: "number", label: "Frost blur", defaultValue: 0, control: "slider", min: 0, max: 24, step: 0.1, unit: "px" },
    frostGrain: { type: "number", label: "Frost grain", defaultValue: 0, control: "slider", min: 0, max: 0.3, step: 0.005 },
    highlightDirection: { type: "number", label: "Highlight direction offset", defaultValue: 0, control: "slider", min: -180, max: 180, step: 1, unit: "°" },
    highlightBrightness: { type: "number", label: "Highlight brightness", defaultValue: 1, control: "slider", min: 0, max: 4, step: 0.01 },
    highlightSharpness: { type: "number", label: "Highlight sharpness", defaultValue: 48, control: "slider", min: 1, max: 256, step: 1 },
    spectralMode: {
        type: "number", label: "Spectral colors", defaultValue: 0, control: "select",
        options: [{ value: 0, label: "Original rainbow" }, { value: 1, label: "Two-tone" }, { value: 2, label: "Custom gradient" }],
    },
    spectralToneA: { type: "color", label: "Spectral tone A", defaultValue: { r: 1, g: 0.15, b: 0.05, a: 1 } },
    spectralToneB: { type: "color", label: "Spectral tone B", defaultValue: { r: 0.05, g: 0.3, b: 1, a: 1 } },
    spectralGradient: {
        type: "gradient", label: "Spectral gradient",
        defaultValue: { stops: [
                { position: 0, color: { r: 1, g: 0.1, b: 0.05, a: 1 } },
                { position: 0.5, color: { r: 0.1, g: 1, b: 0.2, a: 1 } },
                { position: 1, color: { r: 0.1, g: 0.2, b: 1, a: 1 } },
            ] },
    },
    focusRegion: { type: "point-radius", label: "Protected focus", defaultValue: { x: 50, y: 50, radius: 20 }, control: "point-radius", mode: "canvas_and_ui", minRadius: 0, maxRadius: 100, positionUnit: "%", radiusUnit: "%" },
    focusProtection: { type: "number", label: "Focus protection", defaultValue: 0, control: "slider", min: 0, max: 1, step: 0.01 },
    focusSoftness: { type: "number", label: "Focus transition", defaultValue: 15, control: "slider", min: 0, max: 100, step: 0.1, unit: "%" },
    blendAmount: { type: "number", label: "Blend amount", defaultValue: 1, control: "slider", min: 0, max: 1, step: 0.01 },
    swirlPhase: { type: "number", label: "Swirl phase offset", defaultValue: 0, control: "slider", min: -25.13274, max: 25.13274, step: 0.01, unit: "rad" },
    wobblePhase: { type: "number", label: "Wobble phase offset", defaultValue: 0, control: "slider", min: -25.13274, max: 25.13274, step: 0.01, unit: "rad" },
    "strength": {
        type: "number",
        label: "Strength",
        defaultValue: 3,
        control: "slider",
        min: 0,
        max: 8,
        step: 0.1,
    },
    "rim": {
        type: "number",
        label: "Lens rim",
        defaultValue: 1.12,
        control: "slider",
        min: 0.8,
        max: 1.6,
        step: 0.01,
    },
    "dispersion": {
        type: "number",
        label: "Dispersion",
        defaultValue: 1,
        control: "slider",
        min: 0,
        max: 2,
        step: 0.05,
    },
    "trail": {
        type: "number",
        label: "Trail cap",
        defaultValue: 0.2,
        control: "slider",
        min: 0,
        max: 0.6,
        step: 0.01,
    },
    "swirl": {
        type: "number",
        label: "Swirl",
        defaultValue: 1.4,
        control: "slider",
        min: -6,
        max: 6,
        step: 0.05,
    },
    "ripple": {
        type: "number",
        label: "Ripple amplitude",
        defaultValue: 0.05,
        control: "slider",
        min: 0,
        max: 0.5,
        step: 0.005,
    },
    "wavelength": {
        type: "number",
        label: "Wavelength",
        defaultValue: 0.3,
        control: "slider",
        min: 0,
        max: 1,
        step: 0.01,
    },
    "onset": {
        type: "number",
        label: "Ripple onset",
        defaultValue: 0.8,
        control: "slider",
        min: 0,
        max: 1,
        step: 0.01,
    },
    "phase": {
        type: "number",
        label: "Phase",
        defaultValue: 0,
        control: "input",
        step: 0.05,
        unit: "rad",
    },
    "glassStrength": {
        type: "number",
        label: "Liquid glass",
        defaultValue: 1,
        control: "slider",
        min: 0,
        max: 2,
        step: 0.05,
    },
    "background": {
        type: "color",
        label: "Background",
        defaultValue: { "r": 0.949, "g": 0.949, "b": 0.949, "a": 1 },
    },
    "center": {
        type: "point",
        label: "Center",
        defaultValue: { "x": 50, "y": 50 },
        control: "point",
        mode: "canvas_and_ui",
        unit: "%",
    },
    "magnificationPower": {
        type: "number",
        label: "Magnification power",
        defaultValue: 14,
        control: "slider",
        min: 1,
        max: 32,
        step: 0.1,
    },
    "gain": {
        type: "number",
        label: "Gain",
        defaultValue: 1.5,
        control: "slider",
        min: 0,
        max: 4,
        step: 0.05,
    },
});

export const manifest = {
  "version": 2,
  "name": "Spectral attraction lens",
  "isAnimated": false,
  "usesMouse": false
}
