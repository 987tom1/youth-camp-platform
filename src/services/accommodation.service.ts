import type { IAccommodationRepository, IChurchRepository, ISettingsRepository } from '../repositories/interfaces/entity-repositories';
import type { AccommodationBlock } from '../core/entities/accommodation';
import type { AccommodationReservation } from '../core/entities/church';
import type { Registrant } from '../core/entities/registrant';
import type { Actor } from '../core/entities/user';
import { assertCan, assertCanAccessChurch } from './access-control';
import { ForbiddenError, NotFoundError } from '../core/errors/app-error';
import { CreateBlockSchema, UpdateBlockSchema, SetReservationsSchema } from '../core/validation/accommodation.schema';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';

export interface LiveBlock extends AccommodationBlock {
  liveTaken: number;
  available: number;
}

export interface AccommodationService {
  listBlocks(actor: Actor): Promise<LiveBlock[]>;
  getBlock(actor: Actor, id: string): Promise<LiveBlock>;
  createBlock(actor: Actor, input: unknown): Promise<AccommodationBlock>;
  updateBlock(actor: Actor, id: string, input: unknown): Promise<AccommodationBlock>;
  deleteBlock(actor: Actor, id: string): Promise<void>;
  setReservations(actor: Actor, input: unknown): Promise<AccommodationReservation[]>;
  listHeldByChurch(actor: Actor, churchId: string): Promise<AccommodationReservation[]>;
  computeLiveTaken(blocks: AccommodationBlock[], registrants: Registrant[]): Map<string, number>;
}

export function makeAccommodationService(
  blockRepo: IAccommodationRepository,
  churchRepo: IChurchRepository,
  settingsRepo: ISettingsRepository,
): AccommodationService {
  async function assertNotLocked(actor: Actor): Promise<void> {
    if (actor.role === 'admin') return;
    const settings = await settingsRepo.getSingleton();
    if (settings?.accommodationLocked) {
      throw new ForbiddenError('Accommodation is locked. Contact admin to make changes.');
    }
  }

  function computeLiveTaken(blocks: AccommodationBlock[], registrants: Registrant[]): Map<string, number> {
    const taken = new Map<string, number>();
    for (const block of blocks) {
      taken.set(block.id, block.baseTaken);
    }
    for (const r of registrants) {
      if (r.status === 'cancelled') continue;
      if (!r.accommodationLabel) continue;
      for (const block of blocks) {
        if (block.kind === r.accommodationKind && block.name === r.accommodationLabel) {
          taken.set(block.id, (taken.get(block.id) ?? 0) + 1);
          break;
        }
      }
    }
    return taken;
  }

  async function getLiveBlocks(): Promise<LiveBlock[]> {
    const blocks = await blockRepo.findAll();
    return blocks.map((b) => ({
      ...b,
      liveTaken: b.baseTaken,
      available: b.capacity - b.baseTaken,
    }));
  }

  return {
    computeLiveTaken,

    async listBlocks(actor) {
      assertCan(actor, 'registrant:read');
      return getLiveBlocks();
    },

    async getBlock(actor, id) {
      assertCan(actor, 'registrant:read');
      const block = await blockRepo.findById(id);
      if (!block) throw new NotFoundError('Accommodation block not found');
      return { ...block, liveTaken: block.baseTaken, available: block.capacity - block.baseTaken };
    },

    async createBlock(actor, input) {
      assertCan(actor, 'admin:manage');
      await assertNotLocked(actor);
      const data = CreateBlockSchema.parse(input);
      const now = nowISO();
      const block: AccommodationBlock = {
        id: newId('block'),
        ...data,
        baseTaken: data.baseTaken ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      return blockRepo.save(block);
    },

    async updateBlock(actor, id, input) {
      assertCan(actor, 'admin:manage');
      await assertNotLocked(actor);
      const existing = await blockRepo.findById(id);
      if (!existing) throw new NotFoundError('Accommodation block not found');
      const data = UpdateBlockSchema.parse(input);
      return blockRepo.save({ ...existing, ...data, id: existing.id, updatedAt: nowISO() });
    },

    async deleteBlock(actor, id) {
      assertCan(actor, 'admin:manage');
      await assertNotLocked(actor);
      const ok = await blockRepo.delete(id);
      if (!ok) throw new NotFoundError('Accommodation block not found');
    },

    async setReservations(actor, input) {
      const { churchId, reservations } = SetReservationsSchema.parse(input);
      await assertNotLocked(actor);
      // church can only set for own church
      const church = await churchRepo.findById(churchId);
      if (!church) throw new NotFoundError('Church not found');
      assertCanAccessChurch(actor, churchId, church.zone);
      const updated = { ...church, reservations, updatedAt: nowISO() };
      await churchRepo.save(updated);
      return reservations;
    },

    async listHeldByChurch(actor, churchId) {
      const church = await churchRepo.findById(churchId);
      if (!church) throw new NotFoundError('Church not found');
      assertCanAccessChurch(actor, churchId, church.zone);
      return church.reservations ?? [];
    },
  };
}
