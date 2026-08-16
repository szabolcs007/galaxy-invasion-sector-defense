# 0001 — Web platform

Date: 2026-08-15

Chose a web build — TypeScript (strict) + Vite (vanilla-ts), Canvas2D +
hand-written WebGL2 CRT pass, WebAudio square-wave 1-bit audio — over
Rust/bevy, C++/Raylib, Godot, and a Z80/emulator target. Web gives
distribution-as-URL and exact control over the two fidelity-critical
surfaces: the phosphor/scanline CRT shader (monochrome, selectable tint) and
the click-free square-wave sound path. The framework-free core and a Tauri
escape hatch contain the browser-API lock-in: game logic lives in plain
TypeScript modules with no framework dependency, so a native shell can reuse
it unchanged.
