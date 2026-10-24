import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const target = path.join(root, 'src/app/api/preview-addresses/route.ts');
const marker = '// Generated preview-only route. Do not edit.\n';
const enabled = process.env.GITHUB_PAGES !== 'true' && process.env.VERCEL_ENV === 'preview' &&
  process.env.VERCEL_GIT_COMMIT_REF === 'feat/optional-terminal-access';
if (fs.existsSync(target) && !fs.readFileSync(target, 'utf8').startsWith(marker)) {
  throw new Error('Refusing to replace a non-generated address route');
}
if (enabled) {
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, marker + fs.readFileSync(path.join(root, 'src/lib/preview-address-route.ts'), 'utf8'));
} else if (fs.existsSync(target)) {
  fs.unlinkSync(target);
}
