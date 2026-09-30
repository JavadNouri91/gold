import type { KycDocumentDisplayStatus, KycPhase, OwnKycOverview } from '@/lib/api';
import { toPersianDigits } from '@/lib/utils';

export interface KycStepView {
  label: string;
  state: 'done' | 'current' | 'upcoming' | 'failed';
  detail: string;
}

const STEP_LABELS = ['اطلاعات هویتی', 'مدارک شناسایی', 'بررسی مدارک', 'تأیید نهایی'] as const;

export function kycSteps(phase: KycPhase, identityComplete: boolean): KycStepView[] {
  const states: KycStepView['state'][] = identityComplete
    ? statesForPhase(phase)
    : ['current', 'upcoming', 'upcoming', 'upcoming'];
  return STEP_LABELS.map((label, index) => ({
    label,
    state: states[index] ?? 'upcoming',
    detail: stepDetail(states[index] ?? 'upcoming'),
  }));
}

function statesForPhase(phase: KycPhase): KycStepView['state'][] {
  switch (phase) {
    case 'NOT_STARTED':
    case 'IN_PROGRESS':
      return ['done', 'current', 'upcoming', 'upcoming'];
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return ['done', 'done', 'current', 'upcoming'];
    case 'NEEDS_CORRECTION':
      return ['done', 'current', 'done', 'upcoming'];
    case 'VERIFIED':
      return ['done', 'done', 'done', 'done'];
    case 'REJECTED':
      return ['done', 'done', 'done', 'failed'];
    default:
      return ['upcoming', 'upcoming', 'upcoming', 'upcoming'];
  }
}

function stepDetail(state: KycStepView['state']): string {
  if (state === 'done') return 'تکمیل شده';
  if (state === 'current') return 'در حال انجام';
  if (state === 'failed') return 'رد شده';
  return 'در انتظار';
}

export function primaryCta(phase: KycPhase): { label: string; target: string } | null {
  switch (phase) {
    case 'NOT_STARTED':
      return { label: 'شروع احراز هویت', target: 'kyc-documents' };
    case 'IN_PROGRESS':
      return { label: 'ادامه احراز هویت', target: 'kyc-documents' };
    case 'NEEDS_CORRECTION':
      return { label: 'اصلاح مدارک', target: 'kyc-documents' };
    case 'SUBMITTED':
      return { label: 'مشاهده مدارک', target: 'kyc-documents' };
    case 'VERIFIED':
      return { label: 'مشاهده اطلاعات احراز هویت', target: 'kyc-documents' };
    case 'REJECTED':
      return { label: 'مشاهده دلیل رد', target: 'kyc-review' };
    default:
      return null;
  }
}

export function heroCopy(overview: Pick<OwnKycOverview, 'phase' | 'rejectionReason'>): {
  title: string;
  body: string;
} {
  switch (overview.phase) {
    case 'VERIFIED':
      return {
        title: 'احراز هویت شما تأیید شده است',
        body: 'هویت شما تأیید شده و امکانات معاملاتی وابسته به احراز هویت فعال است.',
      };
    case 'UNDER_REVIEW':
      return {
        title: 'احراز هویت شما در حال بررسی است',
        body: 'مدارک شما دریافت شده و در حال بررسی توسط کارشناسان می‌باشد.',
      };
    case 'NEEDS_CORRECTION':
      return {
        title: 'نیاز به اصلاح مدارک',
        body: 'برخی مدارک تأیید نشد. دلیل هر مورد روی کارت همان مدرک نوشته شده است.',
      };
    case 'REJECTED':
      return {
        title: 'درخواست احراز هویت رد شده است',
        body: overview.rejectionReason
          ? overview.rejectionReason
          : 'درخواست احراز هویت تأیید نشد.',
      };
    case 'SUBMITTED':
      return {
        title: 'مدارک شما ارسال شده است',
        body: 'مدارک دریافت شده و در انتظار شروع بررسی است.',
      };
    case 'IN_PROGRESS':
      return {
        title: 'احراز هویت خود را ادامه دهید',
        body: 'بخشی از مدارک ارسال شده است. مدارک باقی‌مانده را با کیفیت مناسب تکمیل کنید.',
      };
    default:
      return {
        title: 'احراز هویت خود را شروع کنید',
        body: 'احراز هویت هنوز شروع نشده است. برای فعال‌سازی کامل امکانات معاملاتی، فرآیند احراز هویت را شروع کنید.',
      };
  }
}

export function reviewCopy(overview: Pick<OwnKycOverview, 'phase' | 'rejectionReason'>): {
  title: string;
  body: string;
} {
  switch (overview.phase) {
    case 'VERIFIED':
      return {
        title: 'بررسی مدارک تکمیل شده است.',
        body: 'نتیجه بررسی، تأیید هویت شما بوده است.',
      };
    case 'UNDER_REVIEW':
      return {
        title: 'مدارک شما در حال بررسی است.',
        body: 'نتیجه بررسی معمولاً پس از تکمیل بررسی از طریق اعلان به شما اطلاع داده می‌شود.',
      };
    case 'NEEDS_CORRECTION':
      return {
        title: 'بررسی انجام شده و برخی مدارک نیاز به اصلاح دارند.',
        body: overview.rejectionReason
          ? overview.rejectionReason
          : 'دلیل هر مدرک در کارت همان مدرک نوشته شده است. پس از اصلاح، پرونده دوباره قابل بررسی است.',
      };
    case 'REJECTED':
      return {
        title: 'درخواست احراز هویت رد شده است.',
        body: overview.rejectionReason
          ? overview.rejectionReason
          : 'جزئیات بیشتری برای این درخواست ثبت نشده است.',
      };
    case 'SUBMITTED':
      return {
        title: 'مدارک دریافت شده است.',
        body: 'بررسی هنوز آغاز نشده است. پس از شروع بررسی، نتیجه از طریق اعلان اعلام می‌شود.',
      };
    case 'IN_PROGRESS':
      return {
        title: 'بررسی هنوز شروع نشده است.',
        body: 'پس از ارسال همه مدارک موردنیاز، پرونده برای بررسی ارسال می‌شود.',
      };
    default:
      return {
        title: 'بررسی هنوز شروع نشده است.',
        body: 'با شروع احراز هویت و ارسال مدارک، وضعیت بررسی اینجا نمایش داده می‌شود.',
      };
  }
}

export const DOCUMENT_STATUS_LABEL: Record<KycDocumentDisplayStatus, string> = {
  NOT_UPLOADED: 'ارسال نشده',
  SUBMITTED: 'ارسال شده',
  UNDER_REVIEW: 'در حال بررسی',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
  NEEDS_CORRECTION: 'نیازمند اصلاح',
};

export function formatKycDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    const day = date.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const time = date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    return `${day} - ${time}`;
  } catch {
    return '—';
  }
}

export function formatMaxSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const label = Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
  return `${toPersianDigits(label)} مگابایت`;
}

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export function resolvedFileMime(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME[extension] ?? file.type;
}

export function validateKycFile(
  file: File | null | undefined,
  policy: { maxBytes: number; mimeTypes: string[] },
): string | null {
  if (!file || file.size <= 0) return 'فایل انتخاب نشده است.';
  const mime = resolvedFileMime(file);
  if (!policy.mimeTypes.includes(mime)) return 'فرمت فایل مجاز نیست.';
  if (file.size > policy.maxBytes) return 'حجم فایل بیش از حد مجاز است.';
  return null;
}

export function uploadErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = error instanceof Error ? error.message : '';
  if (code === 'FILE_TOO_LARGE' || /حجم فایل|exceeds maximum/i.test(message)) {
    return 'حجم فایل بیش از حد مجاز است.';
  }
  if (/فرمت فایل|not allowed/i.test(message)) return 'فرمت فایل مجاز نیست.';
  if (message.includes('انتخاب نشده')) return 'فایل انتخاب نشده است.';
  if (
    (code === 'KYC_UPLOAD_NOT_ALLOWED' || code === 'KYC_DELETE_NOT_ALLOWED') &&
    message &&
    !/[A-Za-z]{4,}/.test(message)
  ) {
    return message;
  }
  return 'ارسال مدرک انجام نشد. لطفاً دوباره تلاش کنید.';
}

export function documentGridClass(count: number): string {
  const base = 'grid grid-cols-1 gap-3';
  if (count <= 1) return base;
  if (count === 2) return `${base} sm:grid-cols-2`;
  if (count === 4) return `${base} sm:grid-cols-2 xl:grid-cols-4`;
  return `${base} sm:grid-cols-2 lg:grid-cols-3`;
}

export function scrollToKycTarget(id: string): void {
  document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}
