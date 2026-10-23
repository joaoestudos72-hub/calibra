// Modo "experimentar": roda o Calibra só em localhost, com banco e anexos temporários
// que são apagados ao encerrar (Ctrl+C). Nada fica instalado ou salvo.
import { mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(path.join(os.tmpdir(), 'calibra-'));
const port = process.env.PORT || '3000';

const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, HOST: '127.0.0.1', PORT: port, NODE_ENV: 'development',
    DATABASE_PATH: path.join(dir, 'calibra.db'), UPLOAD_DIR: path.join(dir, 'uploads') },
});

let cleaned = false;
function cleanup() {
  if (cleaned) return; cleaned = true;
  try { rmSync(dir, { recursive: true, force: true }); console.log('\nDados temporários apagados. Tudo limpo.'); }
  catch (e) { console.log(`\nNão foi possível apagar ${dir}: ${e.message}`); }
}
child.on('exit', () => { cleanup(); process.exit(0); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill());
process.on('exit', cleanup);
console.log(`Modo de teste: http://localhost:${port}  (apenas neste computador, dados temporários)\nPressione Ctrl+C para encerrar e apagar tudo.\n`);
