import { z } from 'zod';
import { USER_ROLES, ZONE_NAMES } from '../types/enums';

export const CreateUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  mobile: z.string().optional(),
  role: z.enum(USER_ROLES),
  churchId: z.string().nullable().optional(),
  churchName: z.string().nullable().optional(),
  zone: z.enum(ZONE_NAMES).nullable().optional(),
  password: z.string().min(8),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  mobile: z.string().optional(),
  role: z.enum(USER_ROLES).optional(),
  churchId: z.string().nullable().optional(),
  churchName: z.string().nullable().optional(),
  zone: z.enum(ZONE_NAMES).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const SetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8),
});

export type SetPasswordInput = z.infer<typeof SetPasswordSchema>;

export const CreateChurchWithAccountSchema = z.object({
  churchName: z.string().min(1),
  zone: z.enum(ZONE_NAMES),
  code: z.string().min(2).max(10),
  selfRegisterSlug: z.string().min(2).max(40),
  expectedCount: z.number().int().min(0).optional().default(0),
  youthPastorName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  // Account for the church's user
  accountFirstName: z.string().min(1),
  accountLastName: z.string().min(1),
  accountEmail: z.string().email(),
  accountPassword: z.string().min(8),
  accountRole: z.enum(['church'] as const).optional().default('church'),
});

export type CreateChurchWithAccountInput = z.infer<typeof CreateChurchWithAccountSchema>;

export const UpdateChurchSchema = z.object({
  name: z.string().min(1).optional(),
  zone: z.enum(ZONE_NAMES).optional(),
  code: z.string().min(2).max(10).optional(),
  selfRegisterSlug: z.string().min(2).max(40).optional(),
  expectedCount: z.number().int().min(0).optional(),
  youthPastorName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
});

export type UpdateChurchInput = z.infer<typeof UpdateChurchSchema>;
