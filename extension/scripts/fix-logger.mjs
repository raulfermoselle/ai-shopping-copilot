import { readFileSync, writeFileSync } from 'fs';

const file = 'src/entry/service-worker.ts';
let content = readFileSync(file, 'utf8');

// Fix pattern: logger.info('SW', Word -> logger.info('SW', 'Word
content = content.replace(/logger\.(info|error|warn)\('SW', ([A-Z])/g, "logger.$1('SW', '$2");

writeFileSync(file, content);
console.log('Fixed logger calls in', file);
