'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { quotationsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/portal/status-badge';
import { formatDate } from '@/lib/utils';

const QUOTATION_STATUS_LABELS: Record<string, string> = {
  GENERATED: 'صادر شده',
  ACTIVE: 'فعال',
  EXPIRED: 'منقضی شده',
  REVISED: 'جدید صادر شده',
  CONVERTED: 'تبدیل به معامله شده',
};

export default function QuotationDetailPage() {
  const params = useParams<{ id: string }>();

  const { data: quotation, error, isLoading } = useSWR(
    `quotations/${params.id}`,
    () => quotationsApi.getById(params.id),
  );

  if (isLoading) return <PageSpinner />;
  if (error) return <Alert variant="error">خطا در بارگذاری پیشنهاد قیمت</Alert>;
  if (!quotation) return null;

  const downloadUrl = quotationsApi.getDownloadUrl(params.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">پیشنهاد قیمت</h1>
          <p className="text-sm text-muted-foreground">نسخه {quotation.version}</p>
        </div>
        <StatusBadge
          status={quotation.status}
          label={QUOTATION_STATUS_LABELS[quotation.status] ?? quotation.status}
        />
      </div>

      <Card>
        <CardHeader><CardTitle>جزئیات پیشنهاد</CardTitle></CardHeader>
        <CardContent>
          <dl className="divide-y divide-border text-sm">
            <InfoRow label="تاریخ صدور" value={formatDate(quotation.generatedAt)} />
            {quotation.validUntil && (
              <InfoRow label="اعتبار تا" value={formatDate(quotation.validUntil)} />
            )}
            <InfoRow label="سفارش مرتبط">
              <Link href={`/portal/orders/${quotation.orderId}`} className="text-gold-600 hover:underline">
                مشاهده سفارش
              </Link>
            </InfoRow>
          </dl>
        </CardContent>
      </Card>

      <Alert variant="info">
        این پیشنهاد قیمت توسط سیستم بر اساس قیمت‌گذاری لحظه‌ای صادر شده است.
        تأیید نهایی معامله پس از بررسی توسط کارشناسان انجام می‌گیرد.
        <strong> این پیشنهاد به معنای تأیید قطعی معامله نیست.</strong>
      </Alert>

      {quotation.documentReference && (
        <div className="flex gap-3">
          <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              دانلود پیشنهاد قیمت (PDF)
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children ?? value}</dd>
    </div>
  );
}
