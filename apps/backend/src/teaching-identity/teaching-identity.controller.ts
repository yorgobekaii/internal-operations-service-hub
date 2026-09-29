import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { TeachingIdentityService } from './teaching-identity.service';
import { RequireActorGuard, resolvedActorFromRequest } from '../service-requests/auth.guard';

@Controller('actors')
export class TeachingIdentityController {
  constructor(private readonly identities: TeachingIdentityService) {}

  @Get()
  list() {
    return this.identities.listActive();
  }

  @Get('me')
  @UseGuards(RequireActorGuard)
  current(@Req() req: unknown) {
    return this.identities.current(resolvedActorFromRequest(req)?.userId);
  }
}
