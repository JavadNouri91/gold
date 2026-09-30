'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { createContext, useContext, type ReactNode } from 'react';

export type SettingsTone = 'blue' | 'purple' | 'red' | 'green';

const TONE: Record<SettingsTone, { header: string; well: string }> = {
  blue: { header: 'bg-[#EFF6FF]', well: 'bg-[#EFF6FF] text-[#2563EB]' },
  purple: { header: 'bg-[#F5F3FF]', well: 'bg-[#F5F3FF] text-[#7C3AED]' },
  red: { header: 'bg-[#FEF2F2]', well: 'bg-[#FEF2F2] text-[#DC2626]' },
  green: { header: 'bg-[#ECFDF3]', well: 'bg-[#ECFDF3] text-[#16A34A]' },
};

const ToneContext = createContext<SettingsTone>('blue');

const interactiveRow =
  'group flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-start transition-colors duration-200 hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D99A00] md:min-h-[68px] md:px-4 md:py-3';

export function SettingsGroup({
  title,
  description,
  icon: Icon,
  tone,
  children,
  footer,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: SettingsTone;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const colors = TONE[tone];
  return (
    <ToneContext.Provider value={tone}>
      <section className="min-w-0">
        <div className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(16,24,40,0.04)] md:rounded-2xl">
          <div className={`flex items-center gap-3 border-b border-[#E5E7EB] px-3 py-3 md:px-4 ${colors.header}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl md:h-10 md:w-10 ${colors.well}`}>
              <Icon className="h-4 w-4 md:h-5 md:w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-[#172033] md:text-base">{title}</h2>
              <p className="mt-0.5 text-[11px] leading-5 text-[#667085] md:text-xs">{description}</p>
            </div>
          </div>
          <div className="divide-y divide-[#E5E7EB]">{children}</div>
          {footer}
        </div>
      </section>
    </ToneContext.Provider>
  );
}

function IconWell({ icon: Icon }: { icon: LucideIcon }) {
  const tone = useContext(ToneContext);
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 md:h-10 md:w-10 ${TONE[tone].well}`}
    >
      <Icon className="h-4 w-4 md:h-[18px] md:w-[18px]" aria-hidden />
    </span>
  );
}

function RowCopy({ title, description }: { title: string; description?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold leading-5 text-[#172033] md:text-[15px] md:leading-6">{title}</span>
      {description ? (
        <span className="mt-0.5 block text-[11px] leading-4 text-[#667085] md:text-xs md:leading-5">{description}</span>
      ) : null}
    </span>
  );
}

function RowChevron() {
  return (
    <ChevronLeft
      className="h-4 w-4 shrink-0 text-[#667085] transition-transform duration-200 group-hover:-translate-x-1"
      aria-hidden
    />
  );
}

export function SettingsLinkRow({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className={interactiveRow}>
      <IconWell icon={icon} />
      <RowCopy title={title} description={description} />
      <RowChevron />
    </Link>
  );
}

export function SettingsButtonRow({
  icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={interactiveRow} onClick={onClick}>
      <IconWell icon={icon} />
      <RowCopy title={title} description={description} />
      <RowChevron />
    </button>
  );
}

export function SettingsValueRow({
  icon,
  title,
  description,
  value,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  value: string;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 px-3 py-2.5 md:min-h-[68px] md:px-4 md:py-3">
      <IconWell icon={icon} />
      <RowCopy title={title} description={description} />
      <span className="inline-flex h-9 shrink-0 items-center rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#172033]">
        {value}
      </span>
    </div>
  );
}
