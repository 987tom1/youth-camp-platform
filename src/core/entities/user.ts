import type { ID, ISODateString } from '../types/common';
import type { UserRole, ZoneName } from '../types/enums';

export interface User {
  id: ID;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  role: UserRole;
  churchId?: string | null;
  churchName?: string | null;
  zone?: ZoneName | null;
  status: 'active' | 'inactive';
  passwordHash?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type SafeUser = Omit<User, 'passwordHash'>;

export interface Actor {
  id: ID;
  role: UserRole;
  churchId: string | null;
  churchName: string | null;
  zone: ZoneName | null;
  displayName: string;
}
