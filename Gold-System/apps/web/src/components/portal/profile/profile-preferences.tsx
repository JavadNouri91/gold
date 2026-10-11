'use client';

import { Bell, Languages, Palette, Scale, Wallet } from 'lucide-react';
import {
  SettingsControlRow,
  SettingsGroup,
  SettingsLinkRow,
  SettingsValueRow,
} from '@/components/portal/settings/settings-list';
import { ThemeSegmentedControl } from '@/components/theme-toggle';
import { useTheme } from '@/components/theme-provider';

export function ProfilePreferences() {
  const { preference } = useTheme();
  const appearanceHint =
    preference === 'system'
      ? 'هماهنگ با تنظیمات نمایش دستگاه'
      : preference === 'dark'
        ? 'حالت تاریک سامانه'
        : 'حالت روشن سامانه';

  return (
    <section id="settings" className="scroll-mt-24 space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-800">تنظیمات</h2>
        <p className="mt-1 text-sm text-[#667085]">اعلان‌ها، نمایش معاملات و ظاهر سامانه</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
            value="تومان"
          />
        </SettingsGroup>

        <SettingsGroup
          tone="blue"
          icon={Palette}
          title="ظاهر و تجربه کاربری"
          description="نمایش و زبان سامانه"
        >
          <SettingsControlRow
            icon={Palette}
            title="ظاهر برنامه"
            description={appearanceHint}
          >
            <ThemeSegmentedControl />
          </SettingsControlRow>
          <SettingsValueRow
            icon={Languages}
            title="زبان"
            description="تنها زبان سامانه"
            value="فارسی"
          />
        </SettingsGroup>
      </div>
    </section>
  );
}
