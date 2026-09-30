import { HttpException, HttpStatus } from '@nestjs/common';

export class SupplierNotFoundException extends HttpException {
  constructor(id: string) {
    super(
      { code: 'SUPPLIER_NOT_FOUND', message: `Supplier "${id}" not found` },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DuplicateSupplierNumberException extends HttpException {
  constructor(number: string) {
    super(
      { code: 'DUPLICATE_SUPPLIER_NUMBER', message: `Supplier number "${number}" already exists` },
      HttpStatus.CONFLICT,
    );
  }
}

export class SupplierNotActiveException extends HttpException {
  constructor(id: string, status: string) {
    super(
      {
        code: 'SUPPLIER_NOT_ACTIVE',
        message: `Supplier "${id}" is not ACTIVE (status: "${status}")`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class SupplierAccountNotFoundException extends HttpException {
  constructor(supplierId: string) {
    super(
      {
        code: 'SUPPLIER_ACCOUNT_NOT_FOUND',
        message: `No account found for supplier "${supplierId}"`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
