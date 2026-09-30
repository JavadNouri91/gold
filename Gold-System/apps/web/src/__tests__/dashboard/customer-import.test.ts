import * as XLSX from 'xlsx';
import {
  buildImportRows,
  parseCustomerCsv,
  readCustomerGrid,
  suggestImportMapping,
} from '@/components/dashboard/customer-widgets';

describe('customer import column matching', () => {
  it('maps bank-style Persian headers onto system columns', () => {
    const headers = ['نام مشتری', 'فامیلی', 'شماره ملی', 'تلفن همراه', 'شماره حساب', 'نشانی'];
    const mapping = suggestImportMapping(headers);
    expect(mapping).toMatchObject({
      firstName: '0',
      lastName: '1',
      nationalId: '2',
      mobile: '3',
      address: '5',
      password: '',
      email: '',
    });

    const rows = buildImportRows(
      [['علی', 'رضایی', '123456789', '9120001111', '1234', 'تهران']],
      mapping,
      'ChangeMe123!',
    );
    expect(rows[0]).toMatchObject({
      firstName: 'علی',
      lastName: 'رضایی',
      nationalId: '0123456789',
      mobile: '09120001111',
      password: 'ChangeMe123!',
      address: 'تهران',
    });
  });

  it('keeps the template columns working', () => {
    const rows = parseCustomerCsv(
      'firstName,lastName,nationalId,mobile,password\r\nعلی,رضایی,0012345678,09120001111,ChangeMe123!\r\n',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].mobile).toBe('09120001111');
    expect(rows[0].nationalId).toBe('0012345678');
  });

  it('reads an xlsx sheet and suggests the same mapping', async () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['نام', 'نام خانوادگی', 'کد ملی', 'موبایل', 'ایمیل'],
      ['سارا', 'موسوی', '0012345678', '09121111111', 'sara@example.com'],
    ]);
    XLSX.utils.book_append_sheet(book, sheet, 'مشتریان');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const file = new File([bytes], 'customers.xlsx');

    const grid = await readCustomerGrid(file);
    const mapping = suggestImportMapping(grid.headers);
    const rows = buildImportRows(grid.rows, mapping, 'ChangeMe123!');

    expect(grid.headers).toEqual(['نام', 'نام خانوادگی', 'کد ملی', 'موبایل', 'ایمیل']);
    expect(rows[0]).toMatchObject({
      firstName: 'سارا',
      lastName: 'موسوی',
      mobile: '09121111111',
      email: 'sara@example.com',
    });
  });
});
