import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isAdminRole, isApproverRole, isHandlerRole, SERVICE_REQUEST_CATEGORIES, type ResolvedActor } from '@internal/shared';
import { CreateDepartmentDto, CreateUserDto, DeactivateUserDto, UpdateDepartmentDto, UpdateMappingDto, UpdateSettingsDto, UpdateUserDto } from './dto';

const ROLES = ['requester', 'handler', 'approver', 'admin'];

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private requireAdmin(actor?: ResolvedActor) {
    if (!actor || !isAdminRole(actor.role)) throw new ForbiddenException('Forbidden: admin role required');
    return actor;
  }

  private async audit(tx: any, actorId: string, entityType: string, entityId: string, action: string, before: unknown, after: unknown) {
    await tx.adminAuditEntry.create({ data: {
      actorId, entityType, entityId, action,
      beforeJson: before === undefined ? null : JSON.stringify(before),
      afterJson: after === undefined ? null : JSON.stringify(after),
    }});
  }

  async users(actor?: ResolvedActor) {
    this.requireAdmin(actor);
    return this.prisma.user.findMany({ include: { departmentRef: true }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  }

  async createUser(dto: CreateUserDto, actor?: ResolvedActor) {
    const admin = this.requireAdmin(actor);
    if (!ROLES.includes(dto.role)) throw new BadRequestException('Invalid role.');
    const department = dto.departmentId ? await this.prisma.department.findUnique({ where: { id: dto.departmentId } }) : null;
    if (dto.departmentId && !department) throw new BadRequestException('Department not found.');
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { id: dto.id.trim(), name: dto.name.trim(), email: dto.email.trim(), role: dto.role, department: department?.name, departmentId: department?.id, pickerVisible: dto.pickerVisible ?? true } });
      await this.audit(tx, admin.userId, 'user', user.id, 'created', null, user);
      return user;
    });
  }

  async updateUser(id: string, dto: UpdateUserDto, actor?: ResolvedActor) {
    const admin = this.requireAdmin(actor);
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('User not found.');
    if (dto.active === false && before.active) throw new BadRequestException('Use the deactivation endpoint so active assignments can be reassigned safely.');
    if (dto.role && !ROLES.includes(dto.role)) throw new BadRequestException('Invalid role.');
    const department = dto.departmentId ? await this.prisma.department.findUnique({ where: { id: dto.departmentId } }) : undefined;
    if (dto.departmentId && !department) throw new BadRequestException('Department not found.');
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: {
        name: dto.name?.trim(), email: dto.email?.trim(), role: dto.role,
        active: dto.active, pickerVisible: dto.pickerVisible, department: department ? department.name : undefined, departmentId: dto.departmentId,
      }});
      await this.audit(tx, admin.userId, 'user', id, 'updated', before, user);
      return user;
    });
  }

  async deactivateUser(id: string, dto: DeactivateUserDto, actor?: ResolvedActor) {
    const admin = this.requireAdmin(actor);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found.');
    if (!target.active) return target;
    const replacement = dto.replacementUserId ? await this.prisma.user.findUnique({ where: { id: dto.replacementUserId } }) : null;
    const queues = await this.prisma.queue.findMany({ where: { OR: [{ ownerId: id }, { backupOwnerId: id }] } });
    const pending = await this.prisma.approvalStep.findMany({ where: { approverId: id, status: 'pending' } });
    if ((queues.length || pending.length) && !replacement) throw new BadRequestException('A replacement user is required for active assignments.');
    if (replacement && (!replacement.active || (queues.length && !isHandlerRole(replacement.role)) || (pending.length && !isApproverRole(replacement.role)))) {
      throw new BadRequestException('Replacement user has an incompatible role or is inactive.');
    }
    return this.prisma.$transaction(async (tx) => {
      if (replacement) {
        for (const queue of queues) {
          await tx.queue.update({ where: { id: queue.id }, data: { ownerId: queue.ownerId === id ? replacement.id : queue.ownerId, backupOwnerId: queue.backupOwnerId === id ? replacement.id : queue.backupOwnerId } });
        }
        if (pending.length) await tx.approvalStep.updateMany({ where: { approverId: id, status: 'pending' }, data: { approverId: replacement.id } });
        await this.audit(tx, admin.userId, 'user', id, 'reassigned_before_deactivation', target, replacement);
      }
      const user = await tx.user.update({ where: { id }, data: { active: false } });
      await this.audit(tx, admin.userId, 'user', id, 'deactivated', target, user);
      return user;
    });
  }

  async departments(actor?: ResolvedActor) {
    this.requireAdmin(actor);
    return this.prisma.department.findMany({ include: { mappings: true }, orderBy: { name: 'asc' } });
  }

  async createDepartment(dto: CreateDepartmentDto, actor?: ResolvedActor) {
    const admin = this.requireAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const department = await tx.department.create({ data: { name: dto.name.trim() } });
      await this.audit(tx, admin.userId, 'department', department.id, 'created', null, department);
      return department;
    });
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto, actor?: ResolvedActor) {
    const admin = this.requireAdmin(actor);
    const before = await this.prisma.department.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Department not found.');
    return this.prisma.$transaction(async (tx) => {
      const department = await tx.department.update({ where: { id }, data: { name: dto.name?.trim(), active: dto.active } });
      if (dto.name) await tx.user.updateMany({ where: { departmentId: id }, data: { department: dto.name.trim() } });
      await this.audit(tx, admin.userId, 'department', id, 'updated', before, department);
      return department;
    });
  }

  async archiveDepartment(id: string, actor?: ResolvedActor) {
    const admin = this.requireAdmin(actor);
    const before = await this.prisma.department.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Department not found.');
    return this.prisma.$transaction(async (tx) => {
      const department = await tx.department.update({ where: { id }, data: { active: false } });
      await tx.departmentCategoryMapping.updateMany({ where: { departmentId: id }, data: { active: false } });
      await this.audit(tx, admin.userId, 'department', id, 'archived', before, department);
      return department;
    });
  }

  async unarchiveDepartment(id: string, actor?: ResolvedActor) {
    const admin = this.requireAdmin(actor);
    const before = await this.prisma.department.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Department not found.');
    return this.prisma.$transaction(async (tx) => {
      const department = await tx.department.update({ where: { id }, data: { active: true } });
      await tx.departmentCategoryMapping.updateMany({ where: { departmentId: id }, data: { active: true } });
      await this.audit(tx, admin.userId, 'department', id, 'unarchived', before, department);
      return department;
    });
  }

  async updateMapping(category: string, dto: UpdateMappingDto, actor?: ResolvedActor) {
    const admin = this.requireAdmin(actor);
    if (!(SERVICE_REQUEST_CATEGORIES as string[]).includes(category)) throw new BadRequestException('Unsupported category.');
    const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!department || !department.active) throw new BadRequestException('Department is missing or archived.');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.departmentCategoryMapping.findUnique({ where: { category } });
      const mapping = await tx.departmentCategoryMapping.upsert({ where: { category }, update: { departmentId: dto.departmentId, active: dto.active ?? true }, create: { category, departmentId: dto.departmentId, active: dto.active ?? true } });
      await this.audit(tx, admin.userId, 'category_mapping', category, 'updated', before, mapping);
      return mapping;
    });
  }

  async settings(actor?: ResolvedActor) {
    this.requireAdmin(actor);
    const row = await this.prisma.systemSettings.upsert({ where: { id: 'default' }, update: {}, create: {} });
    return this.toSettings(row);
  }

  async updateSettings(dto: UpdateSettingsDto, actor?: ResolvedActor) {
    const admin = this.requireAdmin(actor);
    const before = await this.prisma.systemSettings.upsert({ where: { id: 'default' }, update: {}, create: {} });
    const data: any = { updatedBy: admin.userId };
    if (dto.autoApprovalThresholdAmount !== undefined) data.autoApprovalThresholdCents = Math.round(dto.autoApprovalThresholdAmount * 100);
    if (dto.urgentSlaHours !== undefined) data.urgentSlaHours = dto.urgentSlaHours;
    if (dto.highSlaHours !== undefined) data.highSlaHours = dto.highSlaHours;
    if (dto.standardSlaHours !== undefined) data.standardSlaHours = dto.standardSlaHours;
    if (dto.lowSlaHours !== undefined) data.lowSlaHours = dto.lowSlaHours;
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.systemSettings.update({ where: { id: 'default' }, data });
      await this.audit(tx, admin.userId, 'settings', 'default', 'updated', before, row);
      return this.toSettings(row);
    });
  }

  async auditEntries(actor?: ResolvedActor) {
    this.requireAdmin(actor);
    return this.prisma.adminAuditEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  private toSettings(row: any) {
    return { autoApprovalThresholdAmount: row.autoApprovalThresholdCents / 100, slaHours: { Urgent: row.urgentSlaHours, High: row.highSlaHours, Standard: row.standardSlaHours, Low: row.lowSlaHours }, updatedBy: row.updatedBy, updatedAt: row.updatedAt };
  }
}
