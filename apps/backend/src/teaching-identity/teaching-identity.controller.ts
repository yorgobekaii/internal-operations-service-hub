import { Controller, Get } from '@nestjs/common';
import { TeachingIdentityService } from './teaching-identity.service';

@Controller('actors')
export class TeachingIdentityController {
  constructor(private readonly identities: TeachingIdentityService) {}

  @Get()
  list() {
    return this.identities.listActive();
  }
}
