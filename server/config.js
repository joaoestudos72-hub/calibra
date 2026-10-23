import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carrega .env se existir (não sobrescreve variáveis já definidas no ambiente)
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* sem .env: usa o ambiente */ }

const env = process.env;
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const isProd = env.NODE_ENV === 'production';

export const config = Object.freeze({
  isProd,
  port: num(env.PORT, 3000),
  host: env.HOST || '0.0.0.0',
  dbPath: abs(env.DATABASE_PATH || 'data/calibra.db'),
  uploadDir: abs(env.UPLOAD_DIR || 'data/uploads'),
  publicDir: path.join(ROOT, 'public'),
  timezone: env.TIMEZONE || 'America/Sao_Paulo',
  maxUploadBytes: num(env.MAX_UPLOAD_MB, 10) * 1024 * 1024,
  userQuotaBytes: num(env.USER_STORAGE_MB, 200) * 1024 * 1024,
  cookieSecure: bool(env.COOKIE_SECURE, isProd),
  trustProxy: bool(env.TRUST_PROXY, false),
  sessionDays: num(env.SESSION_DAYS, 30),
  allowRegistration: bool(env.ALLOW_REGISTRATION, true),
  kmWindow: num(env.MAINTENANCE_KM_WINDOW, 500),
});
