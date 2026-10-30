'use client';

import useSWR from 'swr';
import { reportsApi } from '@/lib/internal-api';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { OverviewDashboard } from '@/components/dashboard/overview-dashboard';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';

export default function OverviewPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'financial_report.read');
  const { data, error, isLoading, mutate } = useSWR(
    allowed ? 'reports/dashboard' : null,
    () => reportsApi.dashboard(),
  );

  if (!allowed) return <ForbiddenNotice permission="financial_report.read" />;

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="space-y-4">
          <SkeletonBlock className="h-12" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-36" />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-44" />
            ))}
          </div>
        </div>
      ) : null}
      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}
      {data ? <OverviewDashboard data={data} /> : null}
    </div>
  );
}
