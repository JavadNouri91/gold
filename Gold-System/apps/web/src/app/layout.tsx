import type { Metadata } from 'next';
import { Vazirmatn } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/components/theme-provider';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

const vazirmatn = Vazirmatn({
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-vazirmatn',
});

export const metadata: Metadata = {
  title: 'سامانه طلا | پورتال مشتریان',
  description: 'سامانه آنلاین معاملات طلای آب‌شده',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning className={vazirmatn.variable}>
      <body className={`${vazirmatn.className} min-h-screen bg-background font-sans antialiased`}>
        <Script id="gold-theme" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
