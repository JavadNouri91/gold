export const authState = {
  user: {
    id: 'staff-1',
    mobile: '09120000000',
    roles: ['staff'],
    permissions: [] as string[],
  },
  isAuthenticated: true,
  isLoading: false,
  login: jest.fn(async () => ({ requiresOtp: true })),
  verifyOtp: jest.fn(async () => undefined),
  logout: jest.fn(async () => undefined),
};

export function signIn(permissions: string[], roles: string[] = ['staff']) {
  authState.isAuthenticated = true;
  authState.isLoading = false;
  authState.user = {
    id: 'staff-1',
    mobile: '09120000000',
    roles,
    permissions,
  };
}

export function signOut() {
  authState.isAuthenticated = false;
  authState.isLoading = false;
  authState.user.permissions = [];
}
