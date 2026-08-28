import assert from 'node:assert/strict';
import test from 'node:test';
import { redactTrace } from '../dist/redact.js';

test('redacts sensitive keys and stable repeated identifiers', () => {
  const input = {
    api_key: 'sk-demo_12345678901234567890',
    user: { email: 'person@example.com' },
    message: 'Send the receipt to person@example.com from 192.168.1.20',
  };
  const result = redactTrace(input);
  const output = result.value;
  assert.equal(output.api_key, '[REDACTED:SECRET_1]');
  assert.equal(output.user.email, '[REDACTED:EMAIL_1]');
  assert.match(output.message, /\[REDACTED:EMAIL_1\]/);
  assert.match(output.message, /\[REDACTED:IP_ADDRESS_1\]/);
  assert.equal(result.counts.EMAIL, 1);
  assert.equal(result.total, 3);
});

test('does not mutate the original trace', () => {
  const input = { email: 'person@example.com' };
  redactTrace(input);
  assert.equal(input.email, 'person@example.com');
});
