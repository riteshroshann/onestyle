"use client";
// A liquid satin orb rendered in real time on the GPU: a lit sphere whose surface flows with 3D noise,
// a soft pearl iridescence at grazing angles, a sharp specular highlight and a rim light.
// It breathes slowly when idle, ripples with the voice level while listening, and quickens while thinking.
// Without WebGL, or with reduced motion, it falls back to a still CSS rendering of the same look.
import { useEffect, useRef, useState } from "react";

const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uLevel; uniform float uState;
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;} vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
void main(){
  vec2 p = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  p *= 1.12;
  float t = uTime * (0.22 + 0.30 * uState);
  float ang = atan(p.y, p.x);
  float wob = snoise(vec3(cos(ang) * 0.9, sin(ang) * 0.9, t * 0.7)) * (0.022 + 0.09 * uLevel);
  float R = 0.86 + wob;
  float r = length(p);
  float aa = 2.4 / uRes.x;
  float edge = 1.0 - smoothstep(R - aa, R + aa, r);
  if (edge <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 q = p / R;
  float z = sqrt(max(0.0, 1.0 - dot(q, q)));
  vec3 n = normalize(vec3(q, z));
  vec3 np = n * 1.5 + vec3(0.0, 0.0, t);
  float d1 = snoise(np);
  float d2 = snoise(np * 2.0 + 3.7);
  vec3 bump = vec3(snoise(np + vec3(11.0)), snoise(np + vec3(23.0)), 0.0);
  n = normalize(n + bump * (0.07 + 0.40 * uLevel + 0.05 * uState));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L = normalize(vec3(-0.55, 0.62, 0.78));
  vec3 H = normalize(L + V);
  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, H), 0.0), 140.0);
  float bloom = pow(max(dot(n, H), 0.0), 26.0) * 0.22;
  float soft = pow(max(dot(n, H), 0.0), 7.0) * 0.08;
  vec3 Rv = reflect(-V, n);
  float softbox = smoothstep(0.42, 0.62, Rv.y) * (1.0 - smoothstep(0.86, 0.98, Rv.y)) * smoothstep(-0.75, -0.35, Rv.x) * (1.0 - smoothstep(0.05, 0.35, Rv.x));
  float floorbox = smoothstep(-0.55, -0.85, Rv.y) * 0.05;
  float fill = pow(max(dot(n, normalize(normalize(vec3(0.7, -0.45, 0.6)) + V)), 0.0), 18.0) * 0.10;
  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.6);
  vec3 base = mix(vec3(0.018, 0.018, 0.021), vec3(0.075, 0.075, 0.082), smoothstep(-0.9, 1.0, d1));
  vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + d2 * 0.32 + fres * 0.9 + t * 0.04));
  film = mix(vec3(dot(film, vec3(0.3333))), film, 0.72);
  vec3 col = base * (0.30 + 0.95 * diff);
  col += film * (0.04 + 0.62 * fres) * (0.8 + 0.7 * uLevel);
  col += vec3(1.0) * spec + vec3(bloom) + vec3(soft) + vec3(fill);
  col += vec3(0.95, 0.96, 1.0) * softbox * 0.20 + vec3(floorbox);
  col += vec3(0.92, 0.94, 1.0) * fres * 0.16;
  col += film * 0.07 * uState * (1.0 - r);
  gl_FragColor = vec4(col * edge, edge);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}

export function Orb({ size, state = "idle", level = 0, className = "" }: { size: number; state?: string; level?: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ level: 0, target: 0, state: 0 });
  const [fallback, setFallback] = useState(false);
  live.current.target = level;
  live.current.state = state === "listening" ? 1 : state === "thinking" ? 2 : 0;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const gl = c.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) { setFallback(true); return; }
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    } catch { setFallback(true); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes"), uTime = gl.getUniformLocation(prog, "uTime");
    const uLevel = gl.getUniformLocation(prog, "uLevel"), uState = gl.getUniformLocation(prog, "uState");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, visible = true, smoothState = 0;
    const t0 = performance.now();
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(c.clientWidth * dpr));
      if (c.width !== w) { c.width = w; c.height = w; }
      gl.viewport(0, 0, c.width, c.height);
    };
    const frame = () => {
      resize();
      const L = live.current;
      L.level += (L.target - L.level) * 0.18;
      smoothState += (L.state - smoothState) * 0.06;
      gl.uniform2f(uRes, c.width, c.height);
      gl.uniform1f(uTime, still ? 4.0 : (performance.now() - t0) / 1000);
      gl.uniform1f(uLevel, Math.min(1, L.level));
      gl.uniform1f(uState, smoothState);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!still && visible) raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(frame);
    });
    io.observe(c);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); gl.getExtension("WEBGL_lose_context")?.loseContext(); };
  }, []);

  return (
    <div className={`orb ${className}`} style={{ ["--orb" as any]: `${size}px` }} aria-hidden>
      {fallback ? <div className="orb-still" /> : <canvas ref={canvas} />}
    </div>
  );
}
