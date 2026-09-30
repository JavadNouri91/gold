/**
 * Tests for auth utility functions and token storage.
 * We test the auth logic layer without touching the DOM.
 */

import { tokenStore } from '../lib/api';

beforeEach(() => {
  localStorage.clear();
});

describe('tokenStore', () => {
  it('stores and retrieves access token', () => {
    tokenStore.setAccess('test-access-token');
    expect(tokenStore.getAccess()).toBe('test-access-token');
  });

  it('stores and retrieves refresh token', () => {
    tokenStore.setRefresh('test-refresh-token');
    expect(tokenStore.getRefresh()).toBe('test-refresh-token');
  });

  it('clears both tokens', () => {
    tokenStore.setAccess('access');
    tokenStore.setRefresh('refresh');
    tokenStore.clear();
    expect(tokenStore.getAccess()).toBeNull();
    expect(tokenStore.getRefresh()).toBeNull();
  });

  it('returns null when token is not set', () => {
    expect(tokenStore.getAccess()).toBeNull();
    expect(tokenStore.getRefresh()).toBeNull();
  });
});
