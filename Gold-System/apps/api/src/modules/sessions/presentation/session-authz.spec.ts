import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { SessionPoliciesController } from './session-policies.controller';

describe('session policy routes', () => {
  it('requires session.policy.manage to change global and role settings', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, SessionPoliciesController.prototype.updateGlobal),
    ).toEqual(['session.policy.manage']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, SessionPoliciesController.prototype.updateRole),
    ).toEqual(['session.policy.manage']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, SessionPoliciesController.prototype.getGlobal),
    ).toEqual(['session.policy.manage']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, SessionPoliciesController.prototype.listRoles),
    ).toEqual(['session.policy.manage']);
  });
});
