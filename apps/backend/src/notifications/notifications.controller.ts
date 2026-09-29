import { Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { RequireActorGuard, resolvedActorFromRequest } from '../service-requests/auth.guard';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @UseGuards(RequireActorGuard)
  list(@Req() req: unknown) {
    const actor = resolvedActorFromRequest(req);
    return this.notifications.listForActor(actor!.userId);
  }

  @Patch(':id/read')
  @UseGuards(RequireActorGuard)
  markRead(@Param('id') id: string, @Req() req: unknown) {
    const actor = resolvedActorFromRequest(req);
    return this.notifications.markRead(actor!.userId, id);
  }
}
