'use client';

import { Suspense } from 'react';
import { CustomerProfile } from '@/components/dashboard/customer-profile';

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <CustomerProfile customerId={params.id} />
    </Suspense>
  );
}
