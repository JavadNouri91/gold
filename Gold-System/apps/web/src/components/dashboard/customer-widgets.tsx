'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileInput } from '@/components/ui/mobile-input';
import { Modal } from '@/components/ui/modal';
import { Alert } from '@/components/ui/alert';
import { ApiClientError } from '@/lib/api';
import { internalCustomersApi, type StaffCustomer } from '@/lib/internal-api';
import {
  CUSTOMER_TYPE_LABELS,
  formatMobile,
  isValidMobile,
  latinMobile,
  statusLabel,
  toLatinDigits,
  toPersianDigits,
} from '@/lib/utils';

export type BalanceTone = 'pos' | 'neg' | 'zero' | 'hidden';

export function balanceTone(value: string | null | undefined): BalanceTone {
  if (value == null) return 'hidden';
  const trimmed = value.trim();
  if (trimmed.startsWith('-')) return 'neg';
  if (/^0+(\.0+)?$/.test(trimmed)) return 'zero';
  return 'pos';
}

export function accountStatusOf(row: Pick<StaffCustomer, 'accountStatus' | 'status'>): string {
  if (row.accountStatus) return row.accountStatus;
  if (row.status === 'BLOCKED') return 'BLOCKED';
  if (row.status === 'ACTIVE' || row.status === 'APPROVED') return 'ACTIVE';
  return 'INACTIVE';
}

export function displayedStatus(row: StaffCustomer): { code: string; label: string } {
  const account = accountStatusOf(row);
  if (account === 'BLOCKED') return { code: 'BLOCKED', label: 'مسدود' };
  if (account === 'INACTIVE') return { code: 'INACTIVE', label: 'غیرفعال' };
  if (balanceTone(row.balanceRial) === 'neg') return { code: 'DEBTOR', label: 'بدهکار' };
  return { code: 'ACTIVE', label: 'فعال' };
}

const TYPE_CLASS: Record<string, string> = {
  HOUSEHOLD: 'bg-sky-100 text-sky-800',
  PARTNER: 'bg-amber-100 text-amber-800',
  VIP: 'bg-violet-100 text-violet-800',
  WHOLESALE: 'bg-orange-100 text-orange-800',
  CORPORATE: 'bg-slate-100 text-slate-800',
};

export function TypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge className={TYPE_CLASS[type] ?? 'bg-muted text-foreground'}>
      {statusLabel(CUSTOMER_TYPE_LABELS, type)}
    </Badge>
  );
}

export function Toast({
  message,
  onClose,
  tone = 'success',
}: {
  message: string | null;
  onClose: () => void;
  tone?: 'success' | 'error';
}) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div
      role="status"
      className={
        tone === 'error'
          ? 'fixed bottom-4 left-4 z-50 max-w-sm rounded-lg border border-red-200 bg-white px-4 py-3 text-sm shadow-lg'
          : 'fixed bottom-4 left-4 z-50 max-w-sm rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm shadow-lg'
      }
    >
      {message}
    </div>
  );
}

export function CustomerEditDialog({
  customer,
  open,
  onClose,
  onSaved,
}: {
  customer: StaffCustomer | null;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    mobile: '',
    nationalId: '',
    email: '',
    address: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setForm({
      firstName: customer.firstName,
      lastName: customer.lastName,
      mobile: customer.mobile,
      nationalId: customer.nationalId,
      email: customer.email ?? '',
      address: customer.address ?? '',
    });
    setError(null);
  }, [customer]);

  const save = async () => {
    if (!customer) return;
    if (!isValidMobile(form.mobile)) {
      setError('فرمت شماره موبایل صحیح نیست.');
      return;
    }
    if (!/^\d{10}$/.test(form.nationalId.trim())) {
      setError('کد ملی باید ۱۰ رقم باشد.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await internalCustomersApi.update(customer.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        mobile: latinMobile(form.mobile),
        nationalId: form.nationalId.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
      });
      onSaved('اطلاعات مشتری ذخیره شد.');
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'ذخیره انجام نشد.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open && Boolean(customer)} onClose={onClose} title="ویرایش مشتری">
      <div className="space-y-3">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="نام" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
          <Input label="نام خانوادگی" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          <MobileInput label="موبایل" value={form.mobile} onValueChange={(mobile) => setForm({ ...form, mobile })} />
          <Input label="کد ملی" dir="ltr" value={form.nationalId} onChange={(event) => setForm({ ...form, nationalId: event.target.value })} />
          <Input label="ایمیل" dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <Input label="آدرس" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button isLoading={loading} onClick={() => void save()}>ذخیره</Button>
        </div>
      </div>
    </Modal>
  );
}

export interface ImportRow {
  firstName: string;
  lastName: string;
  nationalId: string;
  mobile: string;
  password: string;
  email?: string;
  address?: string;
}

export type ImportFieldKey = keyof ImportRow;

export const IMPORT_FIELDS: Array<{ key: ImportFieldKey; label: string; required: boolean }> = [
  { key: 'firstName', label: 'نام', required: true },
  { key: 'lastName', label: 'نام خانوادگی', required: true },
  { key: 'nationalId', label: 'کد ملی', required: true },
  { key: 'mobile', label: 'موبایل', required: true },
  { key: 'password', label: 'رمز عبور', required: false },
  { key: 'email', label: 'ایمیل', required: false },
  { key: 'address', label: 'آدرس', required: false },
];

export type ImportColumnMap = Record<ImportFieldKey, string>;

const FIELD_ALIASES: Record<ImportFieldKey, string[]> = {
  firstName: ['firstname', 'fname', 'givenname', 'نام', 'ناممشتری', 'نامکوچک'],
  lastName: ['lastname', 'lname', 'familyname', 'surname', 'نامخانوادگی', 'فامیلی', 'نامخانواده'],
  nationalId: ['nationalid', 'nationalcode', 'کدملی', 'شمارهملی', 'شناسهملی'],
  mobile: ['mobile', 'mobilenumber', 'cellphone', 'موبایل', 'تلفنهمراه', 'شمارهموبایل', 'شمارهتماس', 'همراه'],
  password: ['password', 'passwd', 'رمزعبور', 'رمز', 'کلمهعبور', 'رمزاولیه', 'رمزورود'],
  email: ['email', 'emailaddress', 'mail', 'ایمیل', 'پستالکترونیک', 'پستالکترونیکی'],
  address: ['address', 'آدرس', 'نشانی', 'آدرسکامل'],
};

export function emptyImportMap(): ImportColumnMap {
  return {
    firstName: '',
    lastName: '',
    nationalId: '',
    mobile: '',
    password: '',
    email: '',
    address: '',
  };
}

function normalizeHeader(value: string): string {
  return toLatinDigits(value)
    .replace(/^\uFEFF/, '')
    .replace(/[يى]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/\u200c/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./]+/g, '');
}

export function suggestImportMapping(headers: string[]): ImportColumnMap {
  const map = emptyImportMap();
  const used = new Set<number>();
  const normalized = headers.map(normalizeHeader);
  (Object.keys(FIELD_ALIASES) as ImportFieldKey[]).forEach((field) => {
    const aliases = new Set(FIELD_ALIASES[field].map(normalizeHeader));
    const index = normalized.findIndex((header, position) => !used.has(position) && aliases.has(header));
    if (index >= 0) {
      used.add(index);
      map[field] = String(index);
    }
  });
  return map;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function countSeparator(line: string, target: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && char === target) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(headerLine: string): ',' | ';' | '\t' {
  const comma = countSeparator(headerLine, ',');
  const semicolon = countSeparator(headerLine, ';');
  const tab = countSeparator(headerLine, '\t');
  if (tab >= comma && tab >= semicolon && tab > 0) return '\t';
  if (semicolon > comma) return ';';
  return ',';
}

export function parseDelimitedGrid(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0] ?? '');
  return lines.map((line) => splitCsvLine(line, delimiter));
}

function normalizeNationalId(value: string): string {
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (!digits) return '';
  return digits.length <= 10 ? digits.padStart(10, '0') : digits;
}

function normalizeImportedMobile(value: string): string {
  let digits = toLatinDigits(value).replace(/\D/g, '');
  if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('98') && digits.length >= 12) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;
  return digits.slice(0, 11);
}

function cellAt(row: string[], index: string): string {
  if (!index) return '';
  const position = Number(index);
  if (!Number.isInteger(position) || position < 0) return '';
  return row[position] ?? '';
}

export function buildImportRows(rows: string[][], mapping: ImportColumnMap, defaultPassword: string): ImportRow[] {
  const fallback = defaultPassword.trim();
  return rows.flatMap((cells) => {
    const firstName = cellAt(cells, mapping.firstName).trim();
    const lastName = cellAt(cells, mapping.lastName).trim();
    const nationalId = normalizeNationalId(cellAt(cells, mapping.nationalId));
    const mobile = normalizeImportedMobile(cellAt(cells, mapping.mobile));
    const password = cellAt(cells, mapping.password).trim() || fallback;
    const email = cellAt(cells, mapping.email).trim();
    const address = cellAt(cells, mapping.address).trim();
    if (!firstName && !lastName && !nationalId && !mobile && !email && !address) return [];
    const row: ImportRow = { firstName, lastName, nationalId, mobile, password };
    if (email) row.email = email;
    if (address) row.address = address;
    return [row];
  });
}

export function isReadyImportRow(row: ImportRow): boolean {
  return (
    row.firstName.length >= 2 &&
    row.lastName.length >= 2 &&
    /^\d{10}$/.test(row.nationalId) &&
    /^09\d{9}$/.test(row.mobile) &&
    row.password.length >= 8 &&
    (!row.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
  );
}

export function parseCustomerCsv(text: string): ImportRow[] {
  const grid = parseDelimitedGrid(text);
  if (grid.length < 2) return [];
  const mapping = suggestImportMapping(grid[0] ?? []);
  return buildImportRows(grid.slice(1), mapping, '').filter((row) => row.firstName || row.mobile);
}

export function customerImportTemplate(): string {
  const mobile = formatMobile('09120001111', '');
  return `\uFEFFfirstName,lastName,nationalId,mobile,password,email,address\r\nعلی,رضایی,0012345678,${mobile},ChangeMe123!,ali@example.com,تهران\r\n`;
}

function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(file);
  });
}

async function readExcelGrid(file: File): Promise<string[][]> {
  const loaded = await import('xlsx');
  const xlsx = 'read' in loaded ? loaded : (loaded as { default: typeof loaded }).default;
  const book = xlsx.read(await readFileBytes(file), { type: 'array' });
  const sheetName = book.SheetNames[0];
  if (!sheetName) return [];
  const grid = xlsx.utils.sheet_to_json<Array<string | number | boolean | null>>(book.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
  return grid.map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell ?? '').trim()));
}

export async function readCustomerGrid(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const name = file.name.toLowerCase();
  const grid = name.endsWith('.xlsx') || name.endsWith('.xls')
    ? await readExcelGrid(file)
    : parseDelimitedGrid(await file.text());
  const filled = grid.filter((row) => row.some((cell) => cell.trim()));
  if (!filled.length) return { headers: [], rows: [] };
  const width = Math.max(...filled.map((row) => row.length));
  const normalized = filled.map((row) => {
    const next = row.map((cell) => cell.trim());
    while (next.length < width) next.push('');
    return next;
  });
  return {
    headers: normalized[0].map((header, index) => header || `ستون ${toPersianDigits(String(index + 1))}`),
    rows: normalized.slice(1),
  };
}

export function CustomerImportDialog({
  open,
  onClose,
  onImported,
  onFinished,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (message: string) => void;
  onFinished: () => void;
}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ImportColumnMap>(emptyImportMap());
  const [defaultPassword, setDefaultPassword] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setHeaders([]);
    setRows([]);
    setMapping(emptyImportMap());
    setDefaultPassword('');
    setFileName('');
    setError(null);
    setImporting(false);
    setInputKey((current) => current + 1);
  }, [open]);

  const mappedRows = buildImportRows(rows, mapping, defaultPassword);
  const readyRows = mappedRows.filter(isReadyImportRow);
  const used = new Set(Object.values(mapping).filter(Boolean));
  const unused = headers.filter((_, index) => !used.has(String(index)));
  const missing = IMPORT_FIELDS.filter((field) => field.required && !mapping[field.key]).map((field) => field.label);
  const passwordMissing = !mapping.password && defaultPassword.trim().length < 8;

  const loadFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      const grid = await readCustomerGrid(file);
      if (grid.headers.length < 1 || grid.rows.length < 1) {
        setHeaders([]);
        setRows([]);
        setMapping(emptyImportMap());
        setError('فایل ردیف قابل ثبت ندارد.');
        return;
      }
      setHeaders(grid.headers);
      setRows(grid.rows);
      setMapping(suggestImportMapping(grid.headers));
    } catch {
      setHeaders([]);
      setRows([]);
      setMapping(emptyImportMap());
      setError('خواندن فایل انجام نشد. CSV یا Excel را انتخاب کنید.');
    }
  };

  const submit = async () => {
    if (missing.length || passwordMissing || !readyRows.length) return;
    if (readyRows.length > 200) {
      setError('در هر بار حداکثر ۲۰۰ ردیف ثبت می‌شود.');
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const result = await internalCustomersApi.importRows(readyRows);
      onFinished();
      const skipped = mappedRows.length - readyRows.length;
      if (result.failed) {
        const details = result.errors.map((item) => `ردیف ${item.row.toLocaleString('fa-IR')}: ${item.message}`).join(' | ');
        setError(`${result.created.toLocaleString('fa-IR')} مشتری ثبت شد. ${details}`);
        return;
      }
      const extra = skipped ? ` ${skipped.toLocaleString('fa-IR')} ردیف ناقص ارسال نشد.` : '';
      onImported(`${result.created.toLocaleString('fa-IR')} مشتری ثبت شد.${extra}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'ورودی فایل انجام نشد.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="ورودی Excel" className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <div className="space-y-4 text-sm">
        <p>ستون‌های فایل را با ستون‌های سیستم جور کنید. ستون‌هایی که نام آشنا دارند خودشان انتخاب می‌شوند.</p>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <input
          key={inputKey}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="فایل مشتریان"
          disabled={importing}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadFile(file);
          }}
        />
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            const blob = new Blob([customerImportTemplate()], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'customers-template.csv';
            anchor.click();
            URL.revokeObjectURL(url);
          }}
        >
          دانلود الگو
        </Button>

        {headers.length ? (
          <>
            <p className="text-muted-foreground">{fileName}</p>
            <div className="space-y-2">
              <div className="hidden gap-2 px-3 text-xs text-muted-foreground sm:grid sm:grid-cols-[9rem_1fr_10rem]">
                <span>ستون سیستم</span>
                <span>ستون فایل</span>
                <span>نمونه</span>
              </div>
              {IMPORT_FIELDS.map((field) => {
                const sampleIndex = mapping[field.key];
                const sample = sampleIndex
                  ? rows.map((row) => row[Number(sampleIndex)] ?? '').find((value) => value.trim()) ?? ''
                  : '';
                const shown = field.key === 'mobile' && sample ? formatMobile(normalizeImportedMobile(sample), '') : toPersianDigits(sample);
                return (
                  <div key={field.key} className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[9rem_1fr_10rem] sm:items-center">
                    <span className="font-medium">
                      {field.label}
                      {field.required ? <span className="text-red-500"> *</span> : null}
                    </span>
                    <select
                      aria-label={`ستون فایل برای ${field.label}`}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                      value={mapping[field.key]}
                      disabled={importing}
                      onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value })}
                    >
                      <option value="">انتخاب نشده</option>
                      {headers.map((header, index) => (
                        <option key={`${header}-${index}`} value={String(index)}>
                          {header}
                        </option>
                      ))}
                    </select>
                    <span className="truncate text-muted-foreground" title={shown} dir={field.key === 'email' || field.key === 'mobile' ? 'ltr' : undefined}>
                      {shown || '—'}
                    </span>
                  </div>
                );
              })}
            </div>
            <Input
              label="رمز پیش‌فرض"
              hint="اگر فایل ستون رمز ندارد، همین رمز برای ردیف‌ها استفاده می‌شود."
              value={defaultPassword}
              dir="ltr"
              disabled={importing}
              onChange={(event) => setDefaultPassword(event.target.value)}
            />
            {missing.length ? <Alert variant="error">این ستون‌ها را وصل کنید: {missing.join('، ')}</Alert> : null}
            {passwordMissing ? <Alert variant="error">ستون رمز را انتخاب کنید یا یک رمز پیش‌فرض حداقل ۸ نویسه بگذارید.</Alert> : null}
            {unused.length ? <p className="text-muted-foreground">ستون‌های بدون تطبیق: {unused.join('، ')}</p> : null}
            <p>
              {readyRows.length.toLocaleString('fa-IR')} ردیف آماده ثبت است.
              {mappedRows.length > readyRows.length
                ? ` ${(mappedRows.length - readyRows.length).toLocaleString('fa-IR')} ردیف ناقص ارسال نمی‌شود.`
                : ''}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={onClose} disabled={importing}>انصراف</Button>
              <Button type="button" isLoading={importing} disabled={Boolean(missing.length) || passwordMissing || !readyRows.length} onClick={() => void submit()}>
                ثبت مشتریان
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
