import assert from 'node:assert/strict';
import test from 'node:test';
import { detectFailures } from '../dist/detect.js';

test('detects repeated tools and unverified purchase constraints', () => {
  const event = { tool: 'inventory.search', arguments: { q: 'shoes' } };
  const trace = {
    events: [event, event, event, { tool: 'commerce.checkout', arguments: { product_id: 'shoe-217' } }],
  };
  const findings = detectFailures(trace);
  assert.ok(findings.some((finding) => finding.type === 'tool_loop'));
  const purchase = findings.find((finding) => finding.type === 'missing_purchase_constraints');
  assert.deepEqual(purchase.metadata.missing, ['size', 'price', 'seller', 'delivery']);
});

test('detects final citations that were never retrieved', () => {
  const trace = {
    events: [{ tool: 'browser.open_url', arguments: { url: 'https://example.com/opened' }, output: 'https://example.com/opened', status: 'success' }],
    output: 'See https://example.com/opened and https://example.com/invented',
  };
  const findings = detectFailures(trace);
  const citation = findings.find((finding) => finding.type === 'unsupported_citation');
  assert.equal(citation.metadata.count, 1);
});
