import { Controller, Get, Post, Put, Param, Body, UseGuards, Request, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { requireActorId } from '../../../../common/auth/require-actor-id';
import { SupplierService } from '../../application/supplier.service';
import { SupplierStatus } from '../../domain/entities/supplier.entity';

/**
 * Supplier Controller
 *
 * RBAC:
 *   supplier.create — Store Manager / Accountant
 *   supplier.update — Store Manager / Accountant
 *   supplier.read   — Any authorized staff
 *   supplier_account.read — Accountant / Store Manager
 *
 * docs/04-actors-and-permissions.md — Accountant: supplier_account.manage
 * Customers MUST NOT access supplier data.
 */
@Controller('suppliers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @RequirePermissions('supplier.create')
  create(
    @Body()
    body: {
      name: string;
      contactName?: string;
      contactPhone?: string;
      contactEmail?: string;
      notes?: string;
    },
    @Request() req: { user: { userId?: string; sub?: string } },
  ) {
    return this.supplierService.createSupplier(body, requireActorId(req.user));
  }

  @Get()
  @RequirePermissions('supplier.read')
  list(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.supplierService.listSuppliers({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('supplier.read')
  getOne(@Param('id') id: string) {
    return this.supplierService.getSupplierById(id);
  }

  @Put(':id')
  @RequirePermissions('supplier.update')
  update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      contactName: string;
      contactPhone: string;
      contactEmail: string;
      status: SupplierStatus;
      notes: string;
    }>,
    @Request() req: { user: { userId?: string; sub?: string } },
  ) {
    return this.supplierService.updateSupplier(id, body, requireActorId(req.user));
  }

  @Get(':id/account')
  @RequirePermissions('supplier_account.read')
  getAccount(@Param('id') id: string) {
    return this.supplierService.getSupplierAccount(id);
  }
}
