'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageSpinner } from '@/components/ui/spinner';
import { BuyGoldPage } from '@/components/portal/buy-gold/buy-gold-page';
import { SellOrderForm } from '@/components/portal/sell-order-form';

export default function NewOrderPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NewOrderRouter />
    </Suspense>
  );
}

function NewOrderRouter() {
  const searchParams = useSearchParams();
  if (searchParams.get('side') === 'sell') return <SellOrderForm />;
  return <BuyGoldPage />;
}
