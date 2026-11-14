import { parseWorksheet } from '../core/parse';
import { startPlayer } from './player';

export function boot(source: string | null): void {
  document.documentElement.className = 'js';
  const app = document.getElementById('app')!;
  const parsed = source ? parseWorksheet(source) : null;
  if (!parsed || !parsed.ok) {
    app.innerHTML =
      '<h1>No worksheet here</h1><p>This link does not hold a Passalong worksheet. Ask your teacher to send it again.</p>';
    return;
  }
  document.documentElement.lang = parsed.pack.lang;
  startPlayer(app, parsed.pack);
}
