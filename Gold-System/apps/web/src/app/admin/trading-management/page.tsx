import { Suspense } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { TradingManagementPage } from '@/components/dashboard/trading-management/trading-management-page';

export default function TradingManagementRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      }
    >
      <TradingManagementPage />
    </Suspense>
  );
}
