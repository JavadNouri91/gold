'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { isStaffUser } from '@/lib/permissions';
import { firstStaffRoute } from '@/lib/nav';
import { Spinner } from '@/components/ui/spinner';

export default function DashboardIndexPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !isStaffUser(user?.permissions)) return;
    router.replace(firstStaffRoute(user?.permissions));
  }, [isAuthenticated, isLoading, router, user?.permissions]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
