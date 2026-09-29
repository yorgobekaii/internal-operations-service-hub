import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const prisma = {
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      createMany: jest.fn(),
    },
  } as never;
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationsService(prisma);
  });

  it('lists an actor-scoped inbox with unread count', async () => {
    const rows = [{ id: 'n1', actorId: 'maya', readAt: null }];
    (prisma as any).notification.findMany.mockResolvedValue(rows);
    (prisma as any).notification.count.mockResolvedValue(1);

    await expect(service.listForActor('maya')).resolves.toEqual({
      notifications: rows,
      unreadCount: 1,
    });
    expect((prisma as any).notification.findMany).toHaveBeenCalledWith({
      where: { actorId: 'maya' },
      orderBy: { createdAt: 'desc' },
    });
    expect((prisma as any).notification.count).toHaveBeenCalledWith({
      where: { actorId: 'maya', readAt: null },
    });
  });

  it('marks only the owning actor notification as read', async () => {
    const row = { id: 'n1', actorId: 'maya', readAt: null };
    (prisma as any).notification.findFirst.mockResolvedValue(row);
    (prisma as any).notification.update.mockResolvedValue({ ...row, readAt: new Date() });

    await service.markRead('maya', 'n1');
    expect((prisma as any).notification.findFirst).toHaveBeenCalledWith({
      where: { id: 'n1', actorId: 'maya' },
    });
    expect((prisma as any).notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { readAt: expect.any(Date) },
    });
  });

  it('hides cross-actor notification ids', async () => {
    (prisma as any).notification.findFirst.mockResolvedValue(null);
    await expect(service.markRead('maya', 'n1')).rejects.toBeInstanceOf(NotFoundException);
    expect((prisma as any).notification.update).not.toHaveBeenCalled();
  });

  it('deduplicates recipients, excludes the actor, and persists fan-out', async () => {
    await service.fanOut({
      event: 'request.commented',
      requestId: 'r1',
      title: 'VPN access',
      actorId: 'maya',
      requesterId: 'maya',
      ownerId: 'omar',
      backupOwnerId: 'omar',
      approverId: 'lina',
    });

    expect((prisma as any).notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ actorId: 'omar', requestId: 'r1', event: 'request.commented' }),
        expect.objectContaining({ actorId: 'lina', requestId: 'r1', event: 'request.commented' }),
      ],
    });
  });

  it('swallows persistence failures', async () => {
    (prisma as any).notification.createMany.mockRejectedValue(new Error('sqlite unavailable'));
    await expect(service.fanOut({
      event: 'request.declined',
      requestId: 'r1',
      actorId: 'omar',
      requesterId: 'maya',
    })).resolves.toBeUndefined();
  });
});
