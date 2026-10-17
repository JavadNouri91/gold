import { parseCorsOrigins } from './app.config';

describe('parseCorsOrigins', () => {
  it('splits a comma-separated list', () => {
    expect(
      parseCorsOrigins('http://localhost:4000, http://192.168.100.18:4000'),
    ).toEqual(['http://localhost:4000', 'http://192.168.100.18:4000']);
  });

  it('defaults to local Next origins', () => {
    expect(parseCorsOrigins(undefined)).toEqual([
      'http://localhost:4000',
      'http://127.0.0.1:4000',
    ]);
  });
});
