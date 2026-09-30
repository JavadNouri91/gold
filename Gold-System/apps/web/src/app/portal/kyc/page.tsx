'use client';

import useSWR from 'swr';
import { Alert } from '@/components/ui/alert';
import { ApiClientError, kycApi } from '@/lib/api';
import { KycExperience, KycLoadError, KycSkeleton } from '@/components/portal/kyc/kyc-experience';

export default function KycPage() {
  const { data, error, isLoading, mutate } = useSWR('kyc/me', () => kycApi.getMine());

  if (isLoading) return <KycSkeleton />;
  if (error instanceof ApiClientError && error.isNotFound) {
    return <Alert variant="info">پروفایل مشتری برای این حساب کاربری ثبت نشده است.</Alert>;
  }
  if (error || !data) return <KycLoadError onRetry={() => void mutate()} />;
  return <KycExperience overview={data} onChanged={() => mutate()} />;
}
