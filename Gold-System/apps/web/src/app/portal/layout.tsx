'use client';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { DashboardSidebar } from '@/components/portal/dashboard-sidebar';
import { DashboardHeader } from '@/components/portal/dashboard-header';
import { MobileBottomNavigation } from '@/components/portal/mobile-bottom-navigation';
import { Spinner } from '@/components/ui/spinner';

const PUBLIC_ROUTES = ['/portal/login', '/portal/otp'];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (isPublicRoute) return;
    if (!isLoading && !isAuthenticated) {
      router.replace('/portal/login');
    }
  }, [isAuthenticated, isLoading, isPublicRoute, router]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-[#F7F8FA]">
      <Suspense fallback={null}>
        <DashboardSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader onMenu={() => setMenuOpen(true)} />
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 pb-24 md:p-6 md:pb-24 lg:pb-6">{children}</main>
        <MobileBottomNavigation />
      </div>
    </div>
  );
}
