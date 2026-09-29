import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import {
  USER_ID_HEADER,
  isAdminRole,
  isHandlerRole,
  isApproverRole,
  resolveTeachingActor,
  type RequestActor,
  type ResolvedActor,
} from '@internal/shared';
import { TeachingIdentityService } from '../teaching-identity/teaching-identity.service';

function rawUserId(req: unknown): string | undefined {
  const headers = (req as { headers?: Record<string, unknown> }).headers;
  if (!headers) return undefined;
  const raw =
    headers[USER_ID_HEADER] ?? headers['x-user-id'] ?? headers['X-User-Id'];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Single-source teaching identity resolver (fail-closed).
 * Only `x-user-id` is read; role/dept headers and body fields are ignored.
 * Unknown or absent ids yield undefined — callers must 403.
 */
export function resolvedActorFromRequest(req: unknown): ResolvedActor | undefined {
  const attached = (req as { user?: ResolvedActor }).user;
  if (attached) return attached;
  return resolveTeachingActor(rawUserId(req));
}

/** Legacy shape for downstream scoping; derived from the registry only. */
export function actorFromRequest(req: unknown): RequestActor {
  const resolved = resolvedActorFromRequest(req);
  if (!resolved) return {};
  return {
    userId: resolved.userId,
    role: resolved.role,
    department: resolved.department ?? undefined,
  };
}

function attach(req: unknown, actor: ResolvedActor | undefined): void {
  (req as { user?: ResolvedActor }).user = actor;
}

function deny(message: string): never {
  throw new ForbiddenException(message);
}

/** Any known teaching actor; 403 for missing/unknown `x-user-id`. */
@Injectable()
export class RequireActorGuard implements CanActivate {
  constructor(private readonly identities: TeachingIdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const actor = await this.identities.resolve(rawUserId(req));
    attach(req, actor);
    if (!actor) deny('Forbidden: unknown or missing actor');
    return true;
  }
}

@Injectable()
export class RequireHandlerGuard implements CanActivate {
  constructor(private readonly identities: TeachingIdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const actor = await this.identities.resolve(rawUserId(req));
    attach(req, actor);
    if (!actor) deny('Forbidden: unknown or missing actor');
    if (!(isHandlerRole(actor?.role) || isAdminRole(actor?.role))) {
      deny('Forbidden: handler role required');
    }
    return true;
  }
}

@Injectable()
export class RequireApproverGuard implements CanActivate {
  constructor(private readonly identities: TeachingIdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const actor = await this.identities.resolve(rawUserId(req));
    attach(req, actor);
    if (!actor) deny('Forbidden: unknown or missing actor');
    if (!isApproverRole(actor?.role)) deny('Forbidden: approver role required');
    return true;
  }
}

@Injectable()
export class RequireAdminGuard implements CanActivate {
  constructor(private readonly identities: TeachingIdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const actor = await this.identities.resolve(rawUserId(req));
    attach(req, actor);
    if (!actor) deny('Forbidden: unknown or missing actor');
    if (!isAdminRole(actor?.role)) deny('Forbidden: admin role required');
    return true;
  }
}

/**
 * Legacy guard retained for callers that still import it. Nest injects the
 * same identity service used by the current handler guard.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly identities: TeachingIdentityService) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    return new RequireHandlerGuard(this.identities).canActivate(context);
  }
}
