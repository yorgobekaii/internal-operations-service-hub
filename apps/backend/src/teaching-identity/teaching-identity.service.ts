import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SERVICE_REQUEST_CATEGORIES,
  TEACHING_ACTORS,
  resolveTeachingActor,
  type ResolvedActor,
} from '@internal/shared';

@Injectable()
export class TeachingIdentityService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    for (const category of SERVICE_REQUEST_CATEGORIES) {
      const existing = await this.prisma.department.findUnique({ where: { name: category } });
      if (!existing) await this.prisma.department.create({ data: { name: category } });
    }
    for (const actor of TEACHING_ACTORS) {
      const department = actor.department
        ? await this.prisma.department.findUnique({ where: { name: actor.department } })
        : null;
      const existing = await this.prisma.user.findUnique({ where: { id: actor.id } });
      if (!existing) await this.prisma.user.create({
        data: {
          id: actor.id,
          name: actor.name,
          email: `${actor.id}@internal.local`,
          role: actor.role,
          department: actor.department,
          departmentId: department?.id ?? null,
          pickerVisible: true,
        },
      });
    }
    for (const category of SERVICE_REQUEST_CATEGORIES) {
      const department = await this.prisma.department.findUnique({ where: { name: category } });
      if (!department) continue;
      const existing = await this.prisma.departmentCategoryMapping.findUnique({ where: { category } });
      if (!existing) await this.prisma.departmentCategoryMapping.create({ data: { category, departmentId: department.id } });
    }
    await this.prisma.systemSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: {},
    });
  }

  async resolve(userId: string | undefined): Promise<ResolvedActor | undefined> {
    if (!userId) return undefined;
    const user = await this.prisma.user.findUnique({ where: { id: userId.trim() } });
    // The legacy e2e harness deliberately clears the user table after module
    // initialization. Preserve the built-in teaching actors only when there
    // is no database row; an explicitly inactive row still fails closed.
    if (!user) return resolveTeachingActor(userId.trim());
    if (!user.active) return undefined;
    return {
      userId: user.id,
      role: user.role as ResolvedActor['role'],
      department: user.department,
      displayName: `${user.name || user.email} · ${user.role}`,
    };
  }

  async listActive() {
    return this.prisma.user.findMany({
      where: { active: true, pickerVisible: true },
      select: { id: true, name: true, email: true, role: true, department: true, active: true, pickerVisible: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async current(userId: string | undefined) {
    const actor = await this.resolve(userId);
    if (!actor) return undefined;
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true, name: true, email: true, role: true, department: true, active: true, pickerVisible: true } });
    return user ?? { id: actor.userId, name: actor.displayName.split(' · ')[0], email: '', role: actor.role, department: actor.department, active: true, pickerVisible: true };
  }
}
