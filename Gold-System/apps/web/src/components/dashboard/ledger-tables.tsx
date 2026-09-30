import { formatDateTime, formatMoney, formatWeight, statusLabel, LEDGER_DIRECTION_LABELS } from '@/lib/utils';
import type { GoldJournal, LedgerJournal } from '@/lib/internal-api';

export function LedgerTable({ journals }: { journals: LedgerJournal[] }) {
  if (!journals.length) return <p className="text-sm text-muted-foreground">سند مالی ثبت نشده است.</p>;
  return (
    <div className="space-y-4">
      {journals.map((journal) => (
        <article key={journal.id} className="overflow-x-auto rounded-xl border bg-white">
          <header className="flex flex-wrap justify-between gap-2 border-b px-4 py-3 text-sm">
            <span>منبع: {journal.sourceType}</span>
            <span dir="ltr">{journal.sourceId}</span>
            <span>{formatDateTime(journal.postedAt)}</span>
            <span>بدهکار {formatMoney(journal.totalDebits)}</span>
            <span>بستانکار {formatMoney(journal.totalCredits)}</span>
          </header>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-4 py-2 text-right">حساب</th>
                <th className="px-4 py-2 text-right">بدهکار</th>
                <th className="px-4 py-2 text-right">بستانکار</th>
                <th className="px-4 py-2 text-right">شرح</th>
              </tr>
            </thead>
            <tbody>
              {journal.entries.map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="px-4 py-2">{entry.accountName} <span dir="ltr">({entry.accountCode})</span></td>
                  <td className="px-4 py-2">{formatMoney(entry.debit)}</td>
                  <td className="px-4 py-2">{formatMoney(entry.credit)}</td>
                  <td className="px-4 py-2">{entry.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </div>
  );
}

export function GoldLedgerTable({ journals }: { journals: GoldJournal[] }) {
  if (!journals.length) return <p className="text-sm text-muted-foreground">گردش طلا ثبت نشده است.</p>;
  return (
    <div className="space-y-4">
      {journals.map((journal) => (
        <article key={journal.id} className="overflow-x-auto rounded-xl border bg-white">
          <header className="flex flex-wrap justify-between gap-2 border-b px-4 py-3 text-sm">
            <span>{journal.sourceType}</span>
            <span dir="ltr">{journal.sourceId}</span>
            <span>{formatDateTime(journal.postedAt)}</span>
          </header>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-4 py-2 text-right">حساب</th>
                <th className="px-4 py-2 text-right">جهت</th>
                <th className="px-4 py-2 text-right">وزن</th>
                <th className="px-4 py-2 text-right">عیار</th>
              </tr>
            </thead>
            <tbody>
              {journal.entries.map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="px-4 py-2">{entry.accountName} <span dir="ltr">({entry.accountCode})</span></td>
                  <td className="px-4 py-2">{statusLabel(LEDGER_DIRECTION_LABELS, entry.direction)}</td>
                  <td className="px-4 py-2">{formatWeight(entry.quantity)}</td>
                  <td className="px-4 py-2" dir="ltr">{entry.purity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </div>
  );
}
