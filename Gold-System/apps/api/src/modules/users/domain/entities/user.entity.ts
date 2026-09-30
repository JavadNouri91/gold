import { UserStatus } from '@gold/shared-types';

export class UserEntity {
  readonly id: string;
  readonly name: string;
  readonly mobile: string;
  readonly email: string | null;
  readonly status: UserStatus;
  readonly roles: string[];
  readonly permissions: string[];
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: {
    id: string;
    name: string;
    mobile: string;
    email: string | null;
    status: UserStatus;
    roles: string[];
    permissions: string[];
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.name = props.name;
    this.mobile = props.mobile;
    this.email = props.email;
    this.status = props.status;
    this.roles = props.roles;
    this.permissions = props.permissions;
    this.lastLoginAt = props.lastLoginAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  isActive(): boolean {
    return this.status === UserStatus.ACTIVE;
  }

  hasPermission(permission: string): boolean {
    return this.permissions.includes(permission);
  }

  hasRole(roleName: string): boolean {
    return this.roles.includes(roleName);
  }
}
