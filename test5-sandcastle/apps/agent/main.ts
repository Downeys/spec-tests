import { startRepl } from './cli.js';
import { createAppDeps } from './composition-root.js';

void startRepl(createAppDeps());
