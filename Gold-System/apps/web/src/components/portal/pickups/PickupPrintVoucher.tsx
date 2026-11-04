'use client';

import { useEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { PhysicalGoldPickup } from '@/lib/api';
import {
  formatDateTime,
  rialToToman,
  PICKUP_STATUS_LABELS,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';
import { PICKUP_FEE_STATUS_LABELS } from '@/lib/pickup-workflow';

const fa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 6 });
function toman(value: string | null | undefined) {
  const amount = rialToToman(value);
  return amount == null ? '—' : `${fa.format(BigInt(amount.split('.')[0]))} تومان`;
}

// Standard Code 39 patterns for the PKP tracking alphabet (narrow=1, wide=3).
// Encoding reference: ZXing Code39Reader CHARACTER_ENCODINGS (Apache-2.0):
// https://github.com/zxing/zxing/blob/master/core/src/main/java/com/google/zxing/oned/Code39Reader.java
const CODE39: Record<string, number> = {
  '0': 0x034,
  '1': 0x121,
  '2': 0x061,
  '3': 0x160,
  '4': 0x031,
  '5': 0x130,
  '6': 0x070,
  '7': 0x025,
  '8': 0x124,
  '9': 0x064,
  P: 0x052,
  K: 0x103,
  '-': 0x085,
  '*': 0x094,
};

/** Real vector barcode, including start/stop symbols and 10-module quiet zones. */
export function PickupCodeBarcode({ value }: { value: string }) {
  if (!/^PKP-\d{1,20}$/.test(value))
    return (
      <p className="voucher-barcode-fallback">
        شماره پیگیری: <bdi>{value}</bdi>
      </p>
    );
  const bars: { x: number; width: number }[] = [];
  let x = 10;
  for (const char of `*${value}*`) {
    const pattern = CODE39[char];
    for (let bit = 8; bit >= 0; bit--) {
      const width = pattern & (1 << bit) ? 3 : 1;
      if (bit % 2 === 0) bars.push({ x, width });
      x += width;
    }
    x += 1;
  }
  return (
    <svg
      role="img"
      aria-label={`بارکد ${value}`}
      data-barcode-value={value}
      viewBox={`0 0 ${x + 9} 44`}
      className="voucher-barcode"
      preserveAspectRatio="xMidYMid meet"
      style={{ direction: 'ltr' }}
    >
      <rect width={x + 9} height="44" fill="white" />
      <g fill="black" shapeRendering="crispEdges">
        {bars.map((bar) => (
          <rect key={bar.x} x={bar.x} y="2" width={bar.width} height="40" />
        ))}
      </g>
    </svg>
  );
}

/** Pure sheet exported for print-layout regression checks. No interactive controls. */
export function PickupPrintVoucherSheet({
  pickup,
  issuedAt,
}: {
  pickup: PhysicalGoldPickup;
  issuedAt: string;
}) {
  const fee = pickup.fee;
  const rate =
    fee?.mode === 'PERCENTAGE'
      ? `${fa.format(Number(fee.rateValue))}٪`
      : fee?.mode === 'FIXED'
        ? 'مبلغ ثابت'
        : fee?.mode === 'NONE'
          ? 'بدون کارمزد'
          : '—';
  const name = pickup.customer
    ? `${pickup.customer.firstName} ${pickup.customer.lastName}`.trim()
    : 'در دسترس نیست';
  return (
    <article className="pickup-print-voucher" dir="rtl" aria-label="رسید رسمی تحویل فیزیکی طلا">
      <div className="voucher-heading">
        <div className="voucher-brand">
          <svg
            className="voucher-brand-mark"
            viewBox="0 0 40 40"
            fill="none"
            aria-label="نشان سامانه طلا"
            role="img"
          >
            <circle cx="20" cy="20" r="18" stroke="currentColor" />
            <circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth=".5" />
            <path
              d="m9 22 6-10h13l4 9-7 8H13Zm0 0 16 1 7-2m-7 2v6M15 12l10 11"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
          <strong>
            سامانه معاملات
            <br />
            طلای آب‌شده
          </strong>
        </div>
        <div className="voucher-title">
          <h1>رسید رسمی تحویل فیزیکی طلا</h1>
          <span>وضعیت درخواست: {statusLabel(PICKUP_STATUS_LABELS, pickup.status)}</span>
        </div>
        <div className="voucher-reference">
          <p>
            شماره پیگیری: <bdi>{toPersianDigits(pickup.pickupNumber)}</bdi>
          </p>
          <p>
            زمان صدور: <time dateTime={issuedAt}>{formatDateTime(issuedAt)}</time>
          </p>
        </div>
      </div>

      <div className="voucher-info-grid">
        <section className="voucher-section">
          <h2>مشخصات مشتری</h2>
          <table>
            <tbody>
              <tr>
                <th>نام و نام خانوادگی</th>
                <td>{name}</td>
              </tr>
              <tr>
                <th>کد ملی</th>
                <td>در دسترس نیست</td>
              </tr>
              <tr>
                <th>شماره همراه</th>
                <td>
                  <bdi>
                    {pickup.customer?.mobile ? toPersianDigits(pickup.customer.mobile) : '—'}
                  </bdi>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="voucher-section">
          <h2>مشخصات طلای تحویلی</h2>
          <table>
            <tbody>
              <tr>
                <th>وزن طلا</th>
                <td>{fa.format(Number(pickup.weightGrams))} گرم</td>
              </tr>
              <tr>
                <th>عیار / خلوص</th>
                <td>{fa.format(Number(pickup.purityRatio) * 1000)} عیار</td>
              </tr>
              <tr>
                <th>زمان ثبت درخواست</th>
                <td>{formatDateTime(pickup.requestedAt)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <div className="voucher-details-grid">
        <section className="voucher-section">
          <h2>کارمزد و محاسبات مالی</h2>
          <table>
            <tbody>
              <tr>
                <th>قیمت هر گرم هنگام محاسبه</th>
                <td>{toman(pickup.goldPricePerGramRial ?? fee?.goldPricePerGramRial)}</td>
              </tr>
              <tr>
                <th>نرخ کارمزد</th>
                <td>{rate}</td>
              </tr>
              <tr className="voucher-total">
                <th>مبلغ کل کارمزد</th>
                <td>{toman(fee?.amountRial)}</td>
              </tr>
              <tr>
                <th>وضعیت کارمزد</th>
                <td>{PICKUP_FEE_STATUS_LABELS[fee?.status ?? 'NONE']}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="voucher-security" aria-label="تأیید و شناسایی تحویل">
          <div className="voucher-pin">
            <span>کد تأیید تحویل حضوری</span>
            <strong>در دسترس نیست</strong>
          </div>
          <PickupCodeBarcode value={pickup.pickupNumber} />
          <p className="voucher-scan-label" dir="ltr">
            {pickup.pickupNumber}
          </p>
          <p className="voucher-security-note">
            بارکد فقط شناسه درخواست است و جایگزین احراز هویت نیست.
          </p>
        </section>
      </div>

      <div className="voucher-legal">
        <p>این رسید صرفاً به همراه اصل کارت ملی تحویل‌گیرنده در محل شعبه معتبر است.</p>
        <p>
          بهای طلا در معامله خرید قبلی تسویه شده است؛ مبلغ این رسید فقط کارمزد تبدیل به فیزیکی است.{' '}
          {pickup.status !== 'DELIVERED' ? 'این درخواست هنوز تحویل نشده است.' : ''}
        </p>
      </div>
      <div className="voucher-signatures">
        <div>امضا و اثر انگشت مشتری</div>
        <div>امضا و مهر متصدی باجه تحویل</div>
      </div>
    </article>
  );
}

/** Direct body portal prevents app-shell flex/grid sizing from leaking into print. */
export function PickupPrintVoucher({ pickup }: { pickup: PhysicalGoldPickup }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [issuedAt, setIssuedAt] = useState('');
  useEffect(() => {
    const element = document.createElement('div');
    element.className = 'pickup-voucher-host print-only-container hidden print:block';
    document.body.appendChild(element);
    setHost(element);
    const updateIssuedAt = () => setIssuedAt(new Date().toISOString());
    updateIssuedAt();
    const beforePrint = () => flushSync(updateIssuedAt);
    window.addEventListener('beforeprint', beforePrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      element.remove();
    };
  }, []);
  return host && issuedAt
    ? createPortal(<PickupPrintVoucherSheet pickup={pickup} issuedAt={issuedAt} />, host)
    : null;
}
