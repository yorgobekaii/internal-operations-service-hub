import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import {
  OPERATOR_ROLES,
  USER_DEPT_HEADER,
  USER_ID_HEADER,
  USER_ROLE_HEADER,
  type RequestActor,
} from '@internal/shared';

function header(req: unknown, name: string): string | undefined {
  const headers = (req as { headers?: Record<string, unknown> }).headers;
  const value = headers?.[name];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function actorFromRequest(req: unknown): RequestActor {
  return {
    userId: header(req, USER_ID_HEADER) ?? header(req, 'x-user-id'),
    role: header(req, USER_ROLE_HEADER) ?? header(req, 'x-user-role'),
    department: header(req, USER_DEPT_HEADER) ?? header(req, 'x-user-dept'),
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const actor = actorFromRequest(req);
    // Attach identity for downstream scoping/audit; mutation gate unchanged.
    (req as { user?: RequestActor }).user = actor;
    const allowed = (OPERATOR_ROLES as readonly string[]).includes(
      actor.role as string,
    );
    if (!allowed) {
      throw new ForbiddenException('Forbidden: operator role required');
    }
    return true;
  }
}
