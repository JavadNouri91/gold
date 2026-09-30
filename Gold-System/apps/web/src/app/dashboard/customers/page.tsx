'use client';

import { Suspense } from 'react';
import { CustomerDirectory } from '@/components/dashboard/customer-directory';

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomerDirectory />
    </Suspense>
  );
}
