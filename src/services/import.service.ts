import type { ICamperRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import type { Camper } from '../core/entities/camper';
import type { Actor } from '../core/entities/user';
import type { ConsentType } from '../core/types/enums';
import { CONSENT_TYPES } from '../core/types/enums';
import { assertCan } from './access-control';
import { BadRequestError } from '../core/errors/app-error';
import { parseCsv } from '../utils/csv';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import { z } from 'zod';

const ImportOptionsSchema = z.object({
  csvData: z.string().min(1),
  churchId: z.string().optional(),
  defaultZone: z.string().optional(),
  updateExisting: z.boolean().optional().default(false),
});

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

export interface ImportService {
  importCsv(actor: Actor, input: unknown): Promise<ImportResult>;
}

function defaultConsents(): Camper['consents'] {
  const result = {} as Record<ConsentType, { granted: boolean; timestamp: string | null }>;
  for (const t of CONSENT_TYPES) {
    result[t] = { granted: false, timestamp: null };
  }
  return result;
}

function parseGender(val: string): Camper['gender'] {
  const v = val.toLowerCase().trim();
  if (v === 'male' || v === 'm') return 'male';
  if (v === 'female' || v === 'f') return 'female';
  return 'other';
}

function parseGrade(val: string): Camper['grade'] | null {
  const n = parseInt(val, 10);
  if ([7, 8, 9, 10, 11, 12].includes(n)) return n as Camper['grade'];
  return null;
}

export function makeImportService(
  camperRepo: ICamperRepository,
  churchRepo: IChurchRepository,
): ImportService {
  return {
    async importCsv(actor, input) {
      assertCan(actor, 'import:run');
      const opts = ImportOptionsSchema.parse(input);
      const rows = parseCsv(opts.csvData);
      if (rows.length === 0) throw new BadRequestError('CSV has no data rows');

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: ImportResult['errors'] = [];

      const churchCache = new Map<string, string>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 2; // 1-indexed, account for header

        try {
          const firstName = (row['firstName'] ?? row['first_name'] ?? row['First Name'] ?? '').trim();
          const lastName = (row['lastName'] ?? row['last_name'] ?? row['Last Name'] ?? '').trim();

          if (!firstName || !lastName) {
            errors.push({ row: rowNum, message: 'Missing firstName or lastName' });
            skipped++;
            continue;
          }

          const churchIdRaw = (row['churchId'] ?? row['church_id'] ?? opts.churchId ?? '').trim();
          const churchName = (row['churchName'] ?? row['church_name'] ?? row['Church'] ?? '').trim();

          // Resolve churchId
          let resolvedChurchId = churchIdRaw;
          if (!resolvedChurchId && churchName) {
            if (!churchCache.has(churchName)) {
              const churches = await churchRepo.findAll();
              const match = churches.find((c) => c.name.toLowerCase() === churchName.toLowerCase());
              if (match) churchCache.set(churchName, match.id);
            }
            resolvedChurchId = churchCache.get(churchName) ?? '';
          }

          const zone = (row['zone'] ?? row['Zone'] ?? opts.defaultZone ?? '').trim();
          const gender = parseGender(row['gender'] ?? row['Gender'] ?? 'other');
          const grade = parseGrade(row['grade'] ?? row['Grade'] ?? '');
          const kind = (row['kind'] ?? row['Kind'] ?? 'student').trim() as Camper['kind'];
          const dob = (row['dateOfBirth'] ?? row['dob'] ?? row['DOB'] ?? '').trim() || null;
          const mobile = (row['mobile'] ?? row['Mobile'] ?? '').trim() || null;
          const email = (row['email'] ?? row['Email'] ?? '').trim() || null;
          const medical = (row['medical'] ?? row['Medical'] ?? '').trim();
          const dietary = (row['dietary'] ?? row['Dietary'] ?? '').trim();
          const parentName = (row['parentGuardianName'] ?? row['parent_name'] ?? row['Parent'] ?? '').trim() || null;
          const parentPhone = (row['parentPhone'] ?? row['parent_phone'] ?? '').trim() || null;

          // Check for existing camper by name + church
          const existing = await camperRepo.findByChurch(resolvedChurchId);
          const match = existing.find(
            (c) => c.firstName.toLowerCase() === firstName.toLowerCase() && c.lastName.toLowerCase() === lastName.toLowerCase(),
          );

          const now = nowISO();

          if (match && opts.updateExisting) {
            const updated_camper: Camper = {
              ...match,
              firstName,
              lastName,
              gender,
              grade,
              dateOfBirth: dob,
              mobile,
              email,
              zone: zone || match.zone,
              kind: (kind === 'student' || kind === 'leader') ? kind : match.kind,
              medicalConditions: medical ? [medical] : match.medicalConditions,
              dietaryRequirements: dietary ? [dietary] : match.dietaryRequirements,
              parentGuardianName: parentName ?? match.parentGuardianName,
              parentPhone: parentPhone ?? match.parentPhone,
              updatedAt: now,
            };
            await camperRepo.save(updated_camper);
            updated++;
          } else if (!match) {
            const camper: Camper = {
              id: newId('camper'),
              firstName,
              lastName,
              gender,
              dateOfBirth: dob,
              grade,
              school: (row['school'] ?? '').trim() || null,
              zone,
              groupId: null,
              kind: (kind === 'student' || kind === 'leader') ? kind : 'student',
              mobile,
              email,
              suburb: null,
              postcode: null,
              state: null,
              medicalConditions: medical ? [medical] : [],
              dietaryRequirements: dietary ? [dietary] : [],
              otherMedications: null,
              consents: defaultConsents(),
              parentGuardianName: parentName,
              parentPhone,
              parentRelation: null,
              blueCardNumber: null,
              blueCardExpiry: null,
              churchId: resolvedChurchId,
              churchName: churchName || resolvedChurchId,
              atCamp: false,
              status: 'registered',
              checkInHistory: [],
              signOutHistory: [],
              createdAt: now,
              updatedAt: now,
            };
            await camperRepo.save(camper);
            created++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors.push({
            row: rowNum,
            message: err instanceof Error ? err.message : String(err),
          });
          skipped++;
        }
      }

      return { created, updated, skipped, errors };
    },
  };
}
