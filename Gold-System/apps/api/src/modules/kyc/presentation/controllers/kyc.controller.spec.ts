import 'reflect-metadata';
import { KycController } from './kyc.controller';
import { PERMISSIONS_KEY } from '../../../../common/decorators/permissions.decorator';

describe('KycController authorization metadata', () => {
  it('requires kyc.documents.read on the staff file-read route', () => {
    const permissions = Reflect.getMetadata(
      PERMISSIONS_KEY,
      KycController.prototype.readDocumentFile,
    );
    expect(permissions).toEqual(['kyc.documents.read']);
  });

  it('requires kyc.documents.read on the staff document-list route', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, KycController.prototype.getDocuments);
    expect(permissions).toEqual(['kyc.documents.read']);
  });

  it('does not attach staff permissions to the own-file route (ownership is enforced in the service)', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, KycController.prototype.readOwnFile);
    expect(permissions).toBeUndefined();
  });
});
