import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile('src/EvidenceWorkbench.tsx', 'utf8');
const styles = await readFile('src/evidence-workbench.css', 'utf8');
for (const required of ['Evidence operations', 'Source register', 'Review queue', 'Decision history', 'aria-busy="true"', 'role="alert"', 'No evidence snapshot loaded', 'Coordinate promotion blocked', "applyDecision('accept')", "applyDecision('reject')", "applyDecision('defer')"]) {
  assert.ok(component.includes(required), `workbench must include ${required}`);
}
assert.doesNotMatch(component, /className="eyebrow"/);
assert.match(component, /disabled=\{actionPending \|\| coordinateAcceptanceBlocked\(selected\) \|\| !canAcceptConflict\(ledger, selected\)\.allowed\}/);
assert.match(component, /await onLedger\(outcome\.ledger\)/);
assert.match(component, /persisted === false/);
assert.match(component, /selected \|\| actionPending/);
assert.match(component, /onPublish\?\.\(outcome\.publication\)/);
assert.doesNotMatch(styles, /font-size:\s*(?:9|10|11|12)px/);
assert.match(styles, /@media \(max-width: 1040px\)/);
assert.match(styles, /@media \(max-width: 720px\)/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
console.log('Evidence workbench contract passed: review actions, coordinate guard, loading/error/empty states, 13px label floor, tablet/phone layouts, and reduced motion are present.');
