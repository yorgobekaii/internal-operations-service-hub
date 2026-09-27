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
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const actor = resolvedActorFromRequest(req);
    attach(req, actor);
    if (!actor) deny('Forbidden: unknown or missing actor');
    return true;
  }
}

/**
 * Workflow transitions: handler (`handler`/`operator` legacy) or admin only.
 * Requesters and approvers cannot PATCH status (approvers use approve/reject).
 */
@Injectable()
export class RequireHandlerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const actor = resolvedActorFromRequest(req);
    attach(req, actor);
    if (!actor) deny('Forbidden: unknown or missing actor');
    if (!(isHandlerRole(actor?.role) || isAdminRole(actor?.role))) {
      deny('Forbidden: handler role required');
    }
    return true;
  }
}

/** Approval decisions: designated approver role only (assignment checked in service). */
@Injectable()
export class RequireApproverGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const actor = resolvedActorFromRequest(req);
    attach(req, actor);
    if (!actor) deny('Forbidden: unknown or missing actor');
    if (!isApproverRole(actor?.role)) deny('Forbidden: approver role required');
    return true;
  }
}

/** Admin-only (configuration/metrics). Currently used by metrics scoping helpers. */
@Injectable()
export class RequireAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const actor = resolvedActorFromRequest(req);
    attach(req, actor);
    if (!actor) deny('Forbidden: unknown or missing actor');
    if (!isAdminRole(actor?.role)) deny('Forbidden: admin role required');
    return true;
  }
}

/**
 * Legacy guard: preserved for backward compatibility, now fail-closed on the
 * teaching registry. Allows handler/operator + admin (workflow mutations).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return new RequireHandlerGuard().canActivate(context);
  }
}
