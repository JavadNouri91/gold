import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { requireActorId } from '../../../../common/auth/require-actor-id';
import { NotificationService } from '../../application/notification.service';
import {
  NotificationResponseDto,
  NotificationAdminResponseDto,
  NotificationDetailResponseDto,
} from '../../application/dto/notification-response.dto';
import {
  ListNotificationsQueryDto,
  MarkNotificationsReadDto,
} from '../../application/dto/list-notifications.query';

type ActorRequest = { user: { userId?: string; sub?: string; permissions: string[] } };

/**
 * Notification Controller
 *
 * Customer inbox:
 *   GET   /notifications           — own IN_APP inbox (filters, search, sort, page)
 *   GET   /notifications/summary   — own category and unread counts
 *   GET   /notifications/:id       — own detail plus an owned relation summary
 *   PATCH /notifications/:id/read
 *   PATCH /notifications/read      — selected ids, foreign ids are ignored
 *   PATCH /notifications/read-all
 *
 * view=delivery keeps the previous personal delivery log (all channels) so the
 * staff screen can keep reading the same actor's rows.
 *
 * Staff:
 *   GET  /notifications/admin/list
 *   POST /notifications/:id/retry
 *
 * Ownership always comes from the JWT actor. Client user ids are not accepted.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('summary')
  summary(@Request() req: ActorRequest) {
    return this.notificationService.summary(requireActorId(req.user));
  }

  @Get()
  async listMyNotifications(
    @Request() req: ActorRequest,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<
    | NotificationResponseDto[]
    | {
        items: NotificationResponseDto[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      }
  > {
    const actorId = requireActorId(req.user);
    if (query.view === 'delivery') {
      const list = await this.notificationService.listForRecipient(actorId, actorId, false, {
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
      });
      return list.map(NotificationResponseDto.fromEntity);
    }

    const result = await this.notificationService.listInbox(actorId, query);
    return {
      items: result.items.map(NotificationResponseDto.fromEntity),
      meta: result.meta,
    };
  }

  @Patch('read')
  async markSelected(
    @Request() req: ActorRequest,
    @Body() body: MarkNotificationsReadDto,
  ): Promise<{ updated: number }> {
    const updated = await this.notificationService.markReadMany(requireActorId(req.user), body.ids);
    return { updated };
  }

  @Patch('read-all')
  async markAll(@Request() req: ActorRequest): Promise<{ updated: number }> {
    const updated = await this.notificationService.markAllRead(requireActorId(req.user));
    return { updated };
  }

  @Get('admin/list')
  @RequirePermissions('notification.read')
  async adminListForRecipient(
    @Request() req: ActorRequest,
    @Query('recipientId') recipientId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<NotificationAdminResponseDto[]> {
    const list = await this.notificationService.listForRecipient(
      requireActorId(req.user),
      recipientId,
      true,
      {
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      },
    );
    return list.map(NotificationAdminResponseDto.fromEntityAdmin);
  }

  @Get(':id')
  async getNotification(
    @Param('id') id: string,
    @Request() req: ActorRequest,
  ): Promise<NotificationDetailResponseDto> {
    const isStaff = req.user.permissions.includes('notification.read');
    const notification = await this.notificationService.getById(
      requireActorId(req.user),
      id,
      isStaff,
    );
    const relation = await this.notificationService.relationFor(notification);
    return NotificationDetailResponseDto.fromDetail(notification, relation);
  }

  @Patch(':id/read')
  async markRead(
    @Param('id') id: string,
    @Request() req: ActorRequest,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationService.markRead(requireActorId(req.user), id);
    return NotificationResponseDto.fromEntity(notification);
  }

  @Post(':id/retry')
  @RequirePermissions('notification.admin')
  async retryNotification(
    @Param('id') id: string,
    @Request() req: ActorRequest,
  ): Promise<NotificationAdminResponseDto> {
    const notification = await this.notificationService.retryNotification(
      id,
      requireActorId(req.user),
    );
    return NotificationAdminResponseDto.fromEntityAdmin(notification);
  }
}
