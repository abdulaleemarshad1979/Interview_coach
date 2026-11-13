import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const target = join(root, 'public', 'vision', 'wasm');
mkdirSync(target, { recursive: true });
// Copy whatever runtime the installed version ships (1.2+ dropped the nosimd build).
const files = readdirSync(source).filter(file => /^vision_wasm.*\.(js|wasm)$/.test(file));
if (!files.some(file => file === 'vision_wasm_internal.wasm')) throw new Error(`MediaPipe wasm runtime missing in ${source}`);
for (const file of files) cpSync(join(source, file), join(target, file));
