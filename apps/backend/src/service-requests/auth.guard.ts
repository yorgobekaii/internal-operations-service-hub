import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { OPERATOR_ROLES, USER_ROLE_HEADER } from '@internal/shared';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const role = req.headers?.[USER_ROLE_HEADER] ?? req.headers?.['x-user-role'];
    const allowed = (OPERATOR_ROLES as readonly string[]).includes(role);
    if (!allowed) {
      throw new ForbiddenException('Forbidden: operator role required');
    }
    return true;
  }
}
