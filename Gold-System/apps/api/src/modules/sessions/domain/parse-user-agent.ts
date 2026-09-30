export interface ParsedDevice {
  deviceName: string;
  browser: string;
  os: string;
}

export function parseUserAgent(userAgent: string | null | undefined): ParsedDevice {
  const ua = userAgent ?? '';
  return {
    deviceName: deviceName(ua),
    browser: browserName(ua),
    os: osName(ua),
  };
}

function deviceName(ua: string): string {
  if (/ipad/i.test(ua)) return 'iPad';
  if (/iphone/i.test(ua)) return 'iPhone';
  if (/android/i.test(ua) && /mobile/i.test(ua)) return 'Android';
  if (/android/i.test(ua)) return 'Android tablet';
  if (/mobile/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function browserName(ua: string): string {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/chrome|crios/i.test(ua) && !/edg\//i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) return 'Safari';
  return 'Browser';
}

function osName(ua: string): string {
  if (/windows/i.test(ua)) return 'Windows';
  if (/iphone|ipad|ios/i.test(ua)) return 'iOS';
  if (/mac os|macintosh/i.test(ua)) return 'macOS';
  if (/android/i.test(ua)) return 'Android';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Unknown';
}
