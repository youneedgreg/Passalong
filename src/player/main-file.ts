import '../shared/base.css';
import { boot } from './boot';

const data = document.getElementById('pack-data')?.textContent ?? '';
boot(data.startsWith('"') ? (JSON.parse(data) as string) : null);
