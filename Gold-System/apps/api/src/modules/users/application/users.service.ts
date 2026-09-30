import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { UserRepository } from '../infrastructure/repositories/user.repository';
import { AuditService } from '../../audit/application/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from '../domain/entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateUserDto, actorId: string | null = null): Promise<UserEntity> {
    const existing = await this.userRepository.findByMobile(dto.mobile);
    if (existing) {
      throw new ConflictException('A user with this mobile number already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.userRepository.create({
      name: dto.name,
      mobile: dto.mobile,
      email: dto.email ?? null,
      passwordHash,
      roleNames: dto.roleNames ?? [],
    });

    await this.auditService.log({
      actorId,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      after: { name: user.name, mobile: user.mobile, roles: user.roles },
    });

    return user;
  }

  async findById(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findById(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByMobile(mobile: string): Promise<UserEntity | null> {
    return this.userRepository.findByMobile(mobile);
  }

  async findByMobileWithPassword(
    mobile: string,
  ): Promise<{ user: UserEntity; passwordHash: string | null } | null> {
    return this.userRepository.findByMobileWithPassword(mobile);
  }

  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<UserEntity> {
    const existing = await this.findById(id);
    const before = { name: existing.name, status: existing.status, roles: existing.roles };

    const updated = await this.userRepository.update(id, {
      name: dto.name,
      email: dto.email,
      status: dto.status,
      roleNames: dto.roleNames,
    });

    await this.auditService.log({
      actorId,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
      before,
      after: { name: updated.name, status: updated.status, roles: updated.roles },
    });

    return updated;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.userRepository.updateLastLogin(id);
  }

  /**
   * Create a user record for a customer registration — called inside a Prisma transaction.
   * The caller owns the transaction context so that User + Customer creation is atomic.
   */
  async createCustomerUser(
    data: {
      name: string;
      mobile: string;
      email?: string;
      password: string;
      roleId: string;
    },
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string; name: string; mobile: string }> {
    const passwordHash = await argon2.hash(data.password);

    const user = await tx.user.create({
      data: {
        name: data.name,
        mobile: data.mobile,
        email: data.email ?? null,
        passwordHash,
        roles: {
          create: [{ roleId: data.roleId }],
        },
      },
      select: { id: true, name: true, mobile: true },
    });

    return user;
  }
}
