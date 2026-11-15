import '../shared/base.css';
import './about.css';
import { registerSW } from '../shared/sw-register';

// The About page is static HTML; scripts only make it work offline.
registerSW();
