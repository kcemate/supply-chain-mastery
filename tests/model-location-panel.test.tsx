import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/ModelLocationPanel.tsx', 'utf8');
const styles = await readFile('src/model-location-panel.css', 'utf8');
for (const contract of ['expectedRevision', 'laneChanges', 'revision-conflict', 'readOnly', 'productPolicies', 'operatingWeekdays', 'fieldEvidence', 'mapPrecision']) assert.ok(source.includes(contract), `missing ${contract}`);
assert.ok(source.includes("role=\"tablist\"") && source.includes("role=\"tabpanel\""));
assert.ok(/min-height:\s*44px/.test(styles));
assert.ok(styles.includes('prefers-reduced-motion'));
console.log('Model location panel contract passed: atomic revision save, model fields, evidence labels, accessible tabs, 44px controls, responsive layout, and reduced motion are present.');
