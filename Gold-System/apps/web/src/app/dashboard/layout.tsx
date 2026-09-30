'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { isStaffUser } from '@/lib/permissions';
import { firstStaffRoute } from '@/lib/nav';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { DashboardTopbar } from '@/components/dashboard/dashboard-topbar';
import { Spinner } from '@/components/ui/spinner';

const PUBLIC_ROUTES = ['/dashboard/login', '/dashboard/otp'];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.some((route) => pathname === route);
  const staff = isStaffUser(user?.permissions);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (isPublic) {
      if (isAuthenticated && staff) router.replace(firstStaffRoute(user?.permissions));
      if (isAuthenticated && !staff) router.replace('/portal/dashboard');
      return;
    }
    if (!isAuthenticated) {
      router.replace('/dashboard/login');
      return;
    }
    if (!staff) router.replace('/portal/dashboard');
  }, [isAuthenticated, isLoading, isPublic, router, staff, user?.permissions]);

  if (isPublic) return <>{children}</>;
  if (isLoading || !isAuthenticated || !staff) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <DashboardSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 space-y-6 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
