import { execFileSync } from 'node:child_process';

const checks = [
  ['production build', ['run', 'build']],
  ['browser smoke', ['run', 'test:browser']],
];

for (const [label, args] of checks) {
  console.log(`\n> ${label}`);
  execFileSync('npm', args, { stdio: 'inherit' });
}

console.log('\nOntology System verification passed.');
