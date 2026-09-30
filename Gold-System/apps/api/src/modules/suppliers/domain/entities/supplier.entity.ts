/**
 * Supplier Domain Entity
 *
 * Represents an upstream gold supplier / provider.
 * docs/10-entities.md — UpstreamProvider
 * docs/09-domain-model.md — UpstreamProvider 1:1 SupplierAccount
 * docs/05-use-cases.md UC-13, UC-14
 *
 * MVP: Manual entry only (docs/21-business-decisions.md §11.2)
 * Future: API adapter via integrationMode = API_FUTURE
 */

export enum SupplierStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
}

export enum SupplierIntegrationMode {
  MANUAL = 'MANUAL', // MVP — staff manually enters purchase data
  API_FUTURE = 'API_FUTURE', // Future — placeholder for upstream API adapter
}

export class SupplierEntity {
  readonly id: string;
  readonly supplierNumber: string;
  readonly name: string;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly contactEmail: string | null;
  readonly integrationMode: SupplierIntegrationMode;
  readonly status: SupplierStatus;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(data: {
    id: string;
    supplierNumber: string;
    name: string;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    integrationMode: SupplierIntegrationMode;
    status: SupplierStatus;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    Object.assign(this, data);
  }

  isActive(): boolean {
    return this.status === SupplierStatus.ACTIVE;
  }
}
