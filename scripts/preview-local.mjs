import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, EXPO_OFFLINE: '1', EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test-only-public-key', EXPO_PUBLIC_LOCAL_TEST: 'true' };
console.log('PRÉVIA LOCAL: dados fictícios, descartados ao encerrar. Não conectada ao Supabase.');
console.log('Login: teste@innexa.example | Senha de teste: apenas-teste-local');
const backend = spawn(process.execPath, ['--import','tsx','tests/fixtures/backend.ts'], { cwd: root, stdio: 'inherit', env });
const web = spawn(process.execPath, ['node_modules/expo/bin/cli','start','--web','--port','8083','--max-workers','2'], { cwd: root, stdio: 'inherit', env });
let stopping = false;
function stop() { if (stopping) return; stopping = true; backend.kill(); web.kill(); }
process.on('SIGINT',stop); process.on('SIGTERM',stop);
backend.on('exit',code => { if (!stopping && code) { stop(); process.exitCode=code; } });
web.on('exit',code => { stop(); process.exitCode=code ?? 0; });
