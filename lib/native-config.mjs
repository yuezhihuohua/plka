import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { APP_ROOT } from './config.mjs';
export const HOST_NAME = 'com.plka.library';
export function extensionId(appRoot = APP_ROOT) {
  const { key } = JSON.parse(readFileSync(join(appRoot, 'extension', 'manifest.json'), 'utf8'));
  if (!key) throw new Error('Plka extension identity is missing');
  return createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
}
export const extensionOrigin = appRoot => `chrome-extension://${extensionId(appRoot)}/`;
