'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  BadgeCheck,
  Bell,
  Languages,
  Lock,
  MonitorSmartphone,
  Palette,
  Scale,
  Settings,
  Shield,
  User,
  Wallet,
} from 'lucide-react';
import { ApiClientError, customerApi, kycApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { AccountSummary, AccountSummarySkeleton } from '@/components/portal/settings/account-summary';
import { SettingsDangerZone } from '@/components/portal/settings/settings-danger';
import { SettingsButtonRow, SettingsGroup, SettingsLinkRow, SettingsValueRow } from '@/components/portal/settings/settings-list';
import { SettingsSessionsDialog } from '@/components/portal/settings/settings-sessions-dialog';

export default function SettingsPage() {
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const {
    data: customer,
    error: customerError,
    isLoading: customerLoading,
    mutate: reloadCustomer,
  } = useSWR('customer/me', () => customerApi.getMe());
  const {
    data: kyc,
    error: kycError,
    isLoading: kycLoading,
    mutate: reloadKyc,
  } = useSWR(customer ? 'customer/me/kyc' : null, () => kycApi.getMine());

  const missingProfile = customerError instanceof ApiClientError && customerError.isNotFound;

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF4D6] text-[#D99A00]">
          <Settings className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[#172033] md:text-[26px]">تنظیمات</h1>
          <p className="mt-1 hidden text-sm text-[#667085] md:block">
            مدیریت حساب کاربری، امنیت، اعلان‌ها و تنظیمات معاملات
          </p>
        </div>
      </header>

      {customerLoading ? <AccountSummarySkeleton /> : null}
      {missingProfile ? (
        <p className="rounded-lg border border-blue-200 bg-[#EFF6FF] p-4 text-sm text-[#2563EB]" role="status">
          پروفایل مشتری برای این حساب کاربری ثبت نشده است.
        </p>
      ) : null}
      {customerError && !missingProfile ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_2px_8px_rgba(16,24,40,0.04)]" role="alert">
          <p className="text-sm text-[#172033]">تنظیمات قابل دریافت نیست.</p>
          <Button type="button" className="mt-3 bg-[#D99A00] text-white hover:bg-[#B77900]" onClick={() => void reloadCustomer()}>
            تلاش مجدد
          </Button>
        </div>
      ) : null}
      {customer ? (
        <AccountSummary
          customer={customer}
          kycPhase={kyc?.phase}
          kycLoading={kycLoading}
          kycError={Boolean(kycError)}
          onRetryKyc={() => void reloadKyc()}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingsGroup
          tone="blue"
          icon={User}
          title="حساب کاربری"
          description="مدیریت اطلاعات شخصی و حساب کاربری"
        >
          <SettingsLinkRow
            href="/portal/profile"
            icon={User}
            title="اطلاعات شخصی"
            description="تغییر اطلاعات پروفایل و اطلاعات تماس"
          />
          <SettingsLinkRow
            href="/portal/kyc"
            icon={BadgeCheck}
            title="احراز هویت"
            description="مدیریت مدارک و وضعیت احراز هویت"
          />
          <SettingsLinkRow
            href="/portal/profile#security"
            icon={Lock}
            title="رمز عبور"
            description="تغییر رمز عبور حساب"
          />
        </SettingsGroup>

        <SettingsGroup
          tone="red"
          icon={Bell}
          title="اعلان‌ها"
          description="مدیریت نحوه دریافت اعلان‌های سامانه"
        >
          <SettingsLinkRow
            href="/portal/notifications"
            icon={Bell}
            title="تنظیمات اعلان‌ها"
            description="مشاهده اعلان‌های سفارش، معاملات، پرداخت و سامانه"
          />
        </SettingsGroup>

        <SettingsGroup
          tone="purple"
          icon={Shield}
          title="امنیت"
          description="تنظیمات و دسترسی‌های امنیتی حساب"
        >
          <SettingsLinkRow
            href="/portal/profile#security"
            icon={Shield}
            title="امنیت حساب"
            description="تنظیمات امنیتی حساب کاربری"
          />
          <SettingsButtonRow
            icon={MonitorSmartphone}
            title="دستگاه‌های فعال"
            description="مشاهده و مدیریت دستگاه‌هایی که وارد حساب شما هستند"
            onClick={() => setSessionsOpen(true)}
          />
        </SettingsGroup>

        <SettingsGroup
          tone="green"
          icon={Scale}
          title="معاملات"
          description="نمایش وزن و مبلغ در سامانه"
        >
          <SettingsValueRow
            icon={Scale}
            title="واحد نمایش وزن"
            description="واحد ثابت نمایش وزن طلا"
            value="گرم"
          />
          <SettingsValueRow
            icon={Wallet}
            title="واحد نمایش مبلغ"
            description="واحد ثابت نمایش مبلغ"
            value="ریال"
          />
        </SettingsGroup>

        <SettingsDangerZone />

        <SettingsGroup
          tone="blue"
          icon={Palette}
          title="ظاهر و تجربه کاربری"
          description="نمایش و زبان سامانه"
        >
          <SettingsValueRow
            icon={Palette}
            title="ظاهر برنامه"
            description="حالت روشن سامانه"
            value="روشن"
          />
          <SettingsValueRow
            icon={Languages}
            title="زبان"
            description="تنها زبان سامانه"
            value="فارسی"
          />
        </SettingsGroup>
      </div>

      <SettingsSessionsDialog open={sessionsOpen} onClose={() => setSessionsOpen(false)} />
    </div>
  );
}
