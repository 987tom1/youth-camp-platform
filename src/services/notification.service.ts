import type { INotificationRepository, ICamperRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import type { Notification } from '../core/entities/notification';
import type { Actor } from '../core/entities/user';
import { assertCanSendNotification } from './access-control';
import { CreateNotificationSchema } from '../core/validation/notification.schema';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';

export interface NotificationService {
  send(actor: Actor, input: unknown): Promise<Notification>;
  feed(actor: Actor): Promise<Notification[]>;
  latest(actor: Actor): Promise<Notification | null>;
  clearAll(actor: Actor): Promise<{ deleted: number }>;
}

export function makeNotificationService(
  notifRepo: INotificationRepository,
  camperRepo: ICamperRepository,
  churchRepo: IChurchRepository,
): NotificationService {
  async function estimateAudience(scope: string, zone?: string | null, churchId?: string | null): Promise<number> {
    if (scope === 'camp') {
      const all = await camperRepo.findAll();
      return all.filter((c) => c.status !== 'cancelled').length;
    }
    if (scope === 'zone' && zone) {
      const zoned = await camperRepo.findByZone(zone);
      return zoned.filter((c) => c.status !== 'cancelled').length;
    }
    if (scope === 'church' && churchId) {
      const church = await churchRepo.findById(churchId);
      return church?.expectedCount ?? 0;
    }
    return 0;
  }

  async function getActorFeed(actor: Actor): Promise<Notification[]> {
    const active = await notifRepo.findActive();
    return active.filter((n) => {
      if (n.scope === 'camp') return true;
      if (n.scope === 'zone') {
        if (actor.role === 'admin' || actor.role === 'director') return true;
        return actor.zone != null && n.zone === actor.zone;
      }
      if (n.scope === 'church') {
        if (actor.role === 'admin' || actor.role === 'director') return true;
        return actor.churchId != null && n.churchId === actor.churchId;
      }
      return false;
    });
  }

  return {
    async send(actor, input) {
      const data = CreateNotificationSchema.parse(input);
      assertCanSendNotification(actor, data.scope, data.zone);
      const audience = await estimateAudience(data.scope, data.zone, data.churchId);
      const notif: Notification = {
        id: newId('notif'),
        scope: data.scope,
        zone: data.zone ?? null,
        churchId: data.churchId ?? null,
        priority: data.priority ?? 'normal',
        title: data.title,
        body: data.body,
        senderId: actor.id,
        senderName: actor.displayName,
        senderRole: actor.role,
        audienceEstimate: audience,
        expiresAt: data.expiresAt ?? null,
        createdAt: nowISO(),
      };
      return notifRepo.save(notif);
    },

    async feed(actor) {
      return getActorFeed(actor);
    },

    async latest(actor) {
      const feed = await getActorFeed(actor);
      return feed[0] ?? null;
    },

    async clearAll(actor) {
      if (actor.role !== 'admin') {
        throw new Error('Only admin can clear all notifications');
      }
      const all = await notifRepo.findAll();
      for (const n of all) {
        await notifRepo.delete(n.id);
      }
      return { deleted: all.length };
    },
  };
}
