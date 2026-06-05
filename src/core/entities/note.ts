import type { ID, ISODateString } from '../types/common';

export interface StudentNote {
  id: ID;
  camperId: ID;
  body: string;
  authorId: ID;
  authorName: string;
  authorChurchId?: string | null;
  sessionId?: string | null;
  createdAt: ISODateString;
}
