'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { QuotationModal } from '@/components/dashboard/quotation-modal';

export default function QuotationDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const allowed = hasPermission(user?.permissions, 'quotation.read');

  if (!allowed) return <ForbiddenNotice permission="quotation.read" />;

  return (
    <QuotationModal
      quotationId={params.id}
      open
      autoPrint={search.get('print') === '1'}
      onClose={() => router.back()}
    />
  );
}
