import 'dotenv/config';
import path from 'path';
import { startDetranExecutionWorker } from '../src/lib/detran-worker';

if (!process.env.DETRAN_WORKER_ENABLED) {
  process.env.DETRAN_WORKER_ENABLED = 'true';
}

if (!process.env.DETRAN_LOCAL_MODE) {
  process.env.DETRAN_LOCAL_MODE = 'true';
}

if (!process.env.DETRAN_BROWSER_HEADLESS) {
  process.env.DETRAN_BROWSER_HEADLESS = 'false';
}

if (!process.env.DETRAN_BROWSER_CHANNEL && process.platform === 'win32') {
  process.env.DETRAN_BROWSER_CHANNEL = 'msedge';
}

if (!process.env.DETRAN_BROWSER_USER_DATA_DIR) {
  process.env.DETRAN_BROWSER_USER_DATA_DIR = path.resolve(process.cwd(), 'runtime', 'detran-local-profile');
}

console.log('[Detran local] iniciando worker local com navegador real...');
console.log(`[Detran local] canal: ${process.env.DETRAN_BROWSER_CHANNEL || 'playwright-default'}`);
console.log(`[Detran local] perfil persistente: ${process.env.DETRAN_BROWSER_USER_DATA_DIR}`);

startDetranExecutionWorker();
