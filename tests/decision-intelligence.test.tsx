import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile('src/DecisionIntelligencePage.tsx', 'utf8');
const styles = await readFile('src/decision-intelligence.css', 'utf8');

for (const required of [
  'Decision intelligence', 'Human queue', 'Decision history', 'Autonomy policy', 'Measured impact',
  'Evidence and calculation lineage', 'Decision reason', "resolve('approve')", "resolve('reject')", "resolve('defer')",
  'Search decisions', 'Filter decisions by status', 'No decisions need review', 'AI copilot needs setup',
]) assert.ok(component.includes(required), `decision interface must include ${required}`);

assert.match(component, /if \(!reason\.trim\(\)\)/, 'human resolution requires a reason');
assert.match(component, /await onResolve\(decision\.id, action, reason\.trim\(\)\)/, 'resolution callback receives an auditable reason');
assert.match(component, /<table aria-label=/, 'the searchable decision queue uses table semantics');
assert.match(component, /Calculated by the deterministic simulation engine/, 'calculated impact names its source');
assert.match(component, /does not execute an external operational action/, 'approval scope is explicit');
assert.doesNotMatch(component, /const decisions\s*=|seedDecision|mockDecision/, 'the interface does not invent decision history');
assert.doesNotMatch(styles, /font-size:\s*(?:9|10|11|12)px/);
assert.match(styles, /@media \(max-width: 820px\)/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(styles, /outline:\s*(?:0|none)/, 'the module does not suppress inherited focus treatment');

console.log('Decision intelligence contract passed: decision table, measured evidence, human reasoned resolution, empty/setup states, tablet layout, and 13px text floor are present without seeded history.');
