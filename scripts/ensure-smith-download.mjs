import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../public/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx', import.meta.url);
const target = new URL('../dist/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx', import.meta.url);

mkdirSync(new URL('../dist/downloads/', import.meta.url), { recursive: true });
copyFileSync(source, target);

if (statSync(fileURLToPath(target)).size !== statSync(fileURLToPath(source)).size) {
  throw new Error('Smith Manoeuvre workbook was not copied into the static build intact.');
}
