import type {
  IUserRepository,
  IChurchRepository,
  IRegistrantRepository,
  ICamperRepository,
  IAccommodationRepository,
  IFaqRepository,
  IScheduleRepository,
  INotificationRepository,
  ISettingsRepository,
  ISnapshotRepository,
} from '../repositories/interfaces/entity-repositories';
import type { CampSettings } from '../core/entities/settings';
import type { CampMode } from '../core/types/enums';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { ForbiddenError, NotFoundError } from '../core/errors/app-error';
import { nowISO } from '../utils/date';
import { makeSettingsService } from './settings.service';

export interface AdminService {
  reset(actor: Actor): Promise<{ ok: true }>;
  saveDefaults(actor: Actor): Promise<{ ok: true }>;
  newYear(actor: Actor, year: number): Promise<CampSettings>;
  clearNotifications(actor: Actor): Promise<{ deleted: number }>;
  setMode(actor: Actor, mode: CampMode): Promise<CampSettings>;
}

export function makeAdminService(
  userRepo: IUserRepository,
  churchRepo: IChurchRepository,
  registrantRepo: IRegistrantRepository,
  camperRepo: ICamperRepository,
  accommodationRepo: IAccommodationRepository,
  faqRepo: IFaqRepository,
  scheduleRepo: IScheduleRepository,
  notifRepo: INotificationRepository,
  settingsRepo: ISettingsRepository,
  snapshotRepo: ISnapshotRepository,
): AdminService {
  const settingsService = makeSettingsService(settingsRepo);

  return {
    async reset(actor) {
      if (actor.role !== 'admin') throw new ForbiddenError('Only admin can reset data');
      // Load defaults if available
      const defaults = await snapshotRepo.getDefaults();
      if (!defaults) throw new NotFoundError('No defaults snapshot saved');

      // Clear everything
      const [churches, registrants, campers, blocks, faqs, schedule, notifs] = await Promise.all([
        churchRepo.findAll(),
        registrantRepo.findAll(),
        camperRepo.findAll(),
        accommodationRepo.findAll(),
        faqRepo.findAll(),
        scheduleRepo.findAll(),
        notifRepo.findAll(),
      ]);

      await Promise.all([
        ...churches.map((c) => churchRepo.delete(c.id)),
        ...registrants.map((r) => registrantRepo.delete(r.id)),
        ...campers.map((c) => camperRepo.delete(c.id)),
        ...blocks.map((b) => accommodationRepo.delete(b.id)),
        ...faqs.map((f) => faqRepo.delete(f.id)),
        ...schedule.map((s) => scheduleRepo.delete(s.id)),
        ...notifs.map((n) => notifRepo.delete(n.id)),
      ]);

      return { ok: true };
    },

    async saveDefaults(actor) {
      if (actor.role !== 'admin') throw new ForbiddenError('Only admin can save defaults');
      const [churches, users, blocks, faqs, schedule] = await Promise.all([
        churchRepo.findAll(),
        userRepo.findAll(),
        accommodationRepo.findAll(),
        faqRepo.findAll(),
        scheduleRepo.findAll(),
      ]);

      await snapshotRepo.saveDefaults({
        id: 'defaults',
        churches,
        users: users.map((u) => {
          const { passwordHash: _pw, ...rest } = u;
          return rest;
        }),
        accommodationBlocks: blocks,
        faqs,
        schedule,
        createdAt: nowISO(),
      });

      return { ok: true };
    },

    async newYear(actor, year) {
      if (actor.role !== 'admin') throw new ForbiddenError('Only admin can advance the year');
      const settings = await settingsService.get();
      const updated = await settingsRepo.saveSingleton({
        ...settings,
        year,
        campMode: 'pre-camp',
        updatedAt: nowISO(),
      });

      // Clear registrants and campers for the new year
      const [registrants, campers] = await Promise.all([
        registrantRepo.findAll(),
        camperRepo.findAll(),
      ]);
      await Promise.all([
        ...registrants.map((r) => registrantRepo.delete(r.id)),
        ...campers.map((c) => camperRepo.delete(c.id)),
      ]);

      return updated;
    },

    async clearNotifications(actor) {
      assertCan(actor, 'admin:manage');
      const all = await notifRepo.findAll();
      await Promise.all(all.map((n) => notifRepo.delete(n.id)));
      return { deleted: all.length };
    },

    async setMode(actor, mode) {
      return settingsService.setMode(actor, mode);
    },
  };
}
