import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Request } from 'express';
import { CustomersService } from '../../application/customers.service';
import { CustomerDirectoryService } from '../../application/customer-directory.service';
import { RegisterCustomerDto } from '../../application/dto/register-customer.dto';
import { AssignCustomerTypeDto } from '../../application/dto/assign-customer-type.dto';
import { ListCustomersDto } from '../../application/dto/list-customers.dto';
import { UpdateCustomerDto } from '../../application/dto/update-customer.dto';
import { UpdateOwnProfileDto } from '../../application/dto/update-own-profile.dto';
import { SetAccountStatusDto } from '../../application/dto/set-account-status.dto';
import { CreateCustomerNoteDto } from '../../application/dto/customer-note.dto';
import { ImportCustomersDto } from '../../application/dto/import-customers.dto';
import { MAX_AVATAR_BYTES } from '../../domain/avatar-file';
import { Public } from '../../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { CurrentUserData } from '../../../../common/decorators/current-user.decorator';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly service: CustomersService,
    private readonly directory: CustomerDirectoryService,
  ) {}

  // ----------------------------------------------------------------
  // UC-01: Public registration
  // ----------------------------------------------------------------
  @Post('registration')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'UC-01: Register a new customer' })
  @ApiResponse({ status: 201, description: 'Customer registered successfully' })
  @ApiResponse({ status: 409, description: 'Mobile or National ID already registered' })
  register(@Body() dto: RegisterCustomerDto, @Req() req: Request) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.service.register(dto, ip);
  }

  // ----------------------------------------------------------------
  // Staff: list all customers
  // ----------------------------------------------------------------
  @Get('summary')
  @ApiBearerAuth()
  @RequirePermissions('customer.read')
  @ApiOperation({ summary: 'Customer directory KPI summary' })
  summary(@CurrentUser() user: CurrentUserData) {
    return this.directory.summary(user);
  }

  @Get('export')
  @ApiBearerAuth()
  @RequirePermissions('customer.read')
  @ApiOperation({ summary: 'Export the filtered customer directory as CSV' })
  export(@Query() dto: ListCustomersDto, @CurrentUser() user: CurrentUserData) {
    return this.directory.exportCsv(dto, user);
  }

  @Post('import')
  @ApiBearerAuth()
  @RequirePermissions('customer.group.assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import customers from parsed spreadsheet rows' })
  importRows(@Body() dto: ImportCustomersDto, @Req() req: Request) {
    return this.directory.importRows(dto, req.ip ?? undefined);
  }

  @Get()
  @ApiBearerAuth()
  @RequirePermissions('customer.read')
  @ApiOperation({ summary: 'List customers (staff)' })
  list(@Query() dto: ListCustomersDto, @CurrentUser() user: CurrentUserData) {
    return this.directory.list(dto, user);
  }

  // ----------------------------------------------------------------
  // Customer: get own profile
  // ----------------------------------------------------------------
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get own customer profile' })
  getMe(@CurrentUser() user: CurrentUserData) {
    return this.service.findByUserId(user.userId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own contact details. Identity fields are not accepted.' })
  updateMe(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateOwnProfileDto,
    @Req() req: Request,
  ) {
    return this.service.updateOwnProfile(user.userId, dto, req.ip ?? undefined);
  }

  @Post('me/avatar')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload the signed-in customer profile photo' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AVATAR_BYTES },
    }),
  )
  uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.service.uploadOwnAvatar(user.userId, file, req.ip ?? undefined);
  }

  @Get('me/avatar')
  @ApiBearerAuth()
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Read the signed-in customer profile photo' })
  async readAvatar(@CurrentUser() user: CurrentUserData): Promise<StreamableFile> {
    const file = await this.service.readOwnAvatar(user.userId);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: 'inline',
      length: file.buffer.length,
    });
  }

  @Post('me/deletion-request')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request account deletion. Does not delete the account.' })
  requestDeletion(@CurrentUser() user: CurrentUserData, @Req() req: Request) {
    return this.service.requestAccountDeletion(user.userId, req.ip ?? undefined);
  }

  // ----------------------------------------------------------------
  // Staff: get customer by ID
  // ----------------------------------------------------------------
  @Get('check-email')
  @ApiBearerAuth()
  @RequirePermissions('customer.read')
  @ApiOperation({ summary: 'Check if an email address is available (not yet registered)' })
  @ApiResponse({ status: 200, description: '{ available: boolean }' })
  checkEmail(@Query('email') email: string) {
    return this.service.checkEmailAvailable(email ?? '');
  }

  @Get(':id/workspace')
  @ApiBearerAuth()
  @RequirePermissions('customer.read')
  @ApiOperation({ summary: 'Customer 360 workspace' })
  workspace(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.directory.workspace(id, user);
  }

  @Delete(':id/notes/:noteId')
  @ApiBearerAuth()
  @RequirePermissions('customer.group.assign')
  @ApiOperation({ summary: 'Delete a staff note' })
  deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.directory.deleteNote(id, noteId, user.userId);
  }

  @Post(':id/notes')
  @ApiBearerAuth()
  @RequirePermissions('customer.group.assign')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a staff note on a customer' })
  addNote(
    @Param('id') id: string,
    @Body() dto: CreateCustomerNoteDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.directory.addNote(id, dto, user.userId);
  }

  @Patch(':id/account-status')
  @ApiBearerAuth()
  @RequirePermissions('customer.group.assign')
  @ApiOperation({ summary: 'Activate, deactivate, or block a customer account' })
  setAccountStatus(
    @Param('id') id: string,
    @Body() dto: SetAccountStatusDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.directory.setAccountStatus(id, dto, user.userId, req.ip ?? undefined);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @RequirePermissions('customer.group.assign')
  @ApiOperation({ summary: 'Update customer profile fields' })
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.directory.updateProfile(id, dto, user.userId, req.ip ?? undefined);
  }

  @Get(':id')
  @ApiBearerAuth()
  @RequirePermissions('customer.read')
  @ApiOperation({ summary: 'Get customer by ID (staff)' })
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  // ----------------------------------------------------------------
  // UC-04: Assign customer type — BR-C02, BR-C03
  // ----------------------------------------------------------------
  @Patch(':id/type')
  @ApiBearerAuth()
  @RequirePermissions('customer.group.assign')
  @ApiOperation({ summary: 'UC-04: Assign customer type (HOUSEHOLD/PARTNER/VIP)' })
  @ApiResponse({ status: 200, description: 'Type assigned; BR-C03 audit recorded' })
  @ApiResponse({ status: 422, description: 'Business rule violation' })
  assignType(
    @Param('id') id: string,
    @Body() dto: AssignCustomerTypeDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.service.assignType(id, dto, user.userId, req.ip ?? undefined);
  }
}
