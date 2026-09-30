import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { UserEntity } from '../../domain/entities/user.entity';
import { UserStatus } from '@gold/shared-types';

type CreateUserData = {
  name: string;
  mobile: string;
  email: string | null;
  passwordHash: string;
  roleNames: string[];
};

type UpdateUserData = {
  name?: string;
  email?: string;
  status?: UserStatus;
  roleNames?: string[];
};

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUserData): Promise<UserEntity> {
    const roles = await this.prisma.role.findMany({
      where: { name: { in: data.roleNames } },
      include: { permissions: { include: { permission: true } } },
    });

    const record = await this.prisma.user.create({
      data: {
        name: data.name,
        mobile: data.mobile,
        email: data.email,
        passwordHash: data.passwordHash,
        roles: {
          create: roles.map((r) => ({ roleId: r.id })),
        },
      },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });

    return this.toDomain(record);
  }

  async findById(id: string): Promise<UserEntity | null> {
    const record = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    return record ? this.toDomain(record) : null;
  }

  async findByMobile(mobile: string): Promise<UserEntity | null> {
    const record = await this.prisma.user.findUnique({
      where: { mobile },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    return record ? this.toDomain(record) : null;
  }

  async findByMobileWithPassword(
    mobile: string,
  ): Promise<{ user: UserEntity; passwordHash: string | null } | null> {
    const record = await this.prisma.user.findUnique({
      where: { mobile },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!record) return null;
    return { user: this.toDomain(record), passwordHash: record.passwordHash };
  }

  async update(id: string, data: UpdateUserData): Promise<UserEntity> {
    if (data.roleNames !== undefined) {
      // Replace roles
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      if (data.roleNames.length > 0) {
        const roles = await this.prisma.role.findMany({
          where: { name: { in: data.roleNames } },
        });
        await this.prisma.userRole.createMany({
          data: roles.map((r) => ({ userId: id, roleId: r.id })),
        });
      }
    }

    const record = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.status && { status: data.status }),
      },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });

    return this.toDomain(record);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  private toDomain(record: {
    id: string;
    name: string;
    mobile: string;
    email: string | null;
    status: string;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    roles: Array<{
      role: {
        name: string;
        permissions: Array<{ permission: { key: string } }>;
      };
    }>;
  }): UserEntity {
    const roles = record.roles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(record.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key))),
    ];

    return new UserEntity({
      id: record.id,
      name: record.name,
      mobile: record.mobile,
      email: record.email,
      status: record.status as UserStatus,
      roles,
      permissions,
      lastLoginAt: record.lastLoginAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
