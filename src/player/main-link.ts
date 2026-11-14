import '../shared/base.css';
import { decodeLink } from '../core/link';
import { registerSW } from '../shared/sw-register';
import { boot } from './boot';

boot(decodeLink(location.hash));
window.addEventListener('hashchange', () => boot(decodeLink(location.hash)));
registerSW();
