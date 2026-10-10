'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageSpinner } from '@/components/ui/spinner';
import { BuyGoldPage } from '@/components/portal/buy-gold/buy-gold-page';

export default function NewOrderPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NewOrderRouter />
    </Suspense>
  );
}

function NewOrderRouter() {
  const side = useSearchParams().get('side') === 'sell' ? 'sell' : 'buy';
  return <BuyGoldPage key={side} side={side} />;
}
