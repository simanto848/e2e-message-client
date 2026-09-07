import { describe, test, expect } from 'bun:test';
import { logger } from '../logger';

describe('logger redaction', () => {
  test('does not throw on sensitive payloads', () => {
    expect(() =>
      logger.info('Test', {
        secretKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        token: 'abc123',
        nested: { pinCode: '1234', name: 'ok' },
      })
    ).not.toThrow();
  });

  test('warn/error paths are safe in production-like invocation', () => {
    expect(() => logger.warn('Test', new Error('boom'))).not.toThrow();
    expect(() => logger.error('Test', { authorization: 'Bearer xyz' })).not.toThrow();
  });
});
