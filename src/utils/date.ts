export function nowISO(): string {
  return new Date().toISOString();
}

export function daysUntil(isoDate: string, _tz: string): number {
  // returns days until date, negative if past
  try {
    const now = new Date();
    const target = new Date(isoDate + 'T00:00:00');
    return Math.ceil((target.getTime() - now.getTime()) / 86400000);
  } catch {
    return 0;
  }
}

export function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export function ageFromDob(dob: string): number | null {
  try {
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
}
