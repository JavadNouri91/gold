/**
 * Tests for auth utility functions and token storage.
 * We test the auth logic layer without touching the DOM.
 */

import { tokenStore } from '../lib/api';

beforeEach(() => {
  localStorage.clear();
  tokenStore.clear();
});

describe('tokenStore', () => {
  it('stores and retrieves access token', () => {
    tokenStore.setAccess('test-access-token');
    expect(tokenStore.getAccess()).toBe('test-access-token');
    expect(localStorage.getItem('gold_access_token')).toBeNull();
  });

  it('never stores refresh credentials in browser storage', () => {
    tokenStore.setRefresh('test-refresh-token');
    expect(tokenStore.getRefresh()).toBeNull();
    expect(localStorage.getItem('gold_refresh_token')).toBeNull();
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
