import type {
  IRegistrantRepository,
  ICamperRepository,
  IAccommodationRepository,
  INotificationRepository,
  IScheduleRepository,
  IChurchRepository,
} from '../repositories/interfaces/entity-repositories';
import type { CampSettings } from '../core/entities/settings';
import type { Actor } from '../core/entities/user';
import { daysUntil } from '../utils/date';

export interface PreCampDashboard {
  mode: 'pre-camp';
  campName: string;
  year: number;
  startDate: string;
  daysToGo: number;
  totalRegistrants: number;
  totalCampers: number;
  totalLeaders: number;
  unpaidCount: number;
  noBlueCardCount: number;
  accommodationSummary: Array<{
    blockId: string;
    blockName: string;
    kind: string;
    capacity: number;
    taken: number;
    available: number;
  }>;
  perChurchBreakdown?: Array<{
    churchId: string;
    churchName: string;
    zone: string;
    registrants: number;
    unpaid: number;
    noBlueCard: number;
  }>;
}

export interface AtCampDashboard {
  mode: 'at-camp';
  campName: string;
  greetingName: string;
  totalAtCamp: number;
  totalExpected: number;
  checkInsDue: number;
  currentSession: { id: string; label: string; day: string; startTime: string } | null;
  nextSession: { id: string; label: string; day: string; startTime: string } | null;
  latestNotification: { title: string; body: string; priority: string; createdAt: string } | null;
}

export type DashboardResult = PreCampDashboard | AtCampDashboard;

export interface DashboardService {
  home(actor: Actor, settings: CampSettings): Promise<DashboardResult>;
}

export function makeDashboardService(
  registrantRepo: IRegistrantRepository,
  camperRepo: ICamperRepository,
  accommodationRepo: IAccommodationRepository,
  notifRepo: INotificationRepository,
  scheduleRepo: IScheduleRepository,
  churchRepo: IChurchRepository,
): DashboardService {
  return {
    async home(actor, settings) {
      if (settings.campMode === 'pre-camp') {
        // Pre-camp dashboard
        const allRegistrants = await registrantRepo.findAll();
        const scoped = allRegistrants.filter((r) => {
          if (r.status === 'cancelled') return false;
          if (actor.role === 'admin' || actor.role === 'director') return true;
          if (actor.role === 'zoneLeader') return actor.zone != null && r.zone === actor.zone;
          return r.churchId === actor.churchId;
        });

        const unpaidCount = scoped.filter((r) => r.paymentStatus === 'unpaid').length;
        const noBlueCardCount = scoped.filter((r) => r.kind === 'leader' && !r.blueCardCollected).length;

        const blocks = await accommodationRepo.findAll();
        const accommodationSummary = blocks.map((b) => ({
          blockId: b.id,
          blockName: b.name,
          kind: b.kind,
          capacity: b.capacity,
          taken: b.baseTaken,
          available: b.capacity - b.baseTaken,
        }));

        const dashboard: PreCampDashboard = {
          mode: 'pre-camp',
          campName: settings.campName,
          year: settings.year,
          startDate: settings.startDate,
          daysToGo: daysUntil(settings.startDate, settings.timezone),
          totalRegistrants: scoped.length,
          totalCampers: scoped.filter((r) => r.kind === 'camper').length,
          totalLeaders: scoped.filter((r) => r.kind === 'leader').length,
          unpaidCount,
          noBlueCardCount,
          accommodationSummary,
        };

        if (actor.role === 'admin' || actor.role === 'director') {
          const churches = await churchRepo.findAll();
          const breakdown = churches.map((ch) => {
            const churchRegs = scoped.filter((r) => r.churchId === ch.id);
            return {
              churchId: ch.id,
              churchName: ch.name,
              zone: ch.zone,
              registrants: churchRegs.length,
              unpaid: churchRegs.filter((r) => r.paymentStatus === 'unpaid').length,
              noBlueCard: churchRegs.filter((r) => r.kind === 'leader' && !r.blueCardCollected).length,
            };
          });
          dashboard.perChurchBreakdown = breakdown;
        }

        return dashboard;
      } else {
        // At-camp dashboard
        const atCampers = await camperRepo.findAtCamp();
        const allCampers = await camperRepo.findAll();
        const totalExpected = allCampers.filter((c) => c.status !== 'cancelled').length;

        // Get check-in sessions for today
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const checkInItems = await scheduleRepo.getCheckInPoints();
        const todaySessions = checkInItems.filter((i) => i.day === todayStr);

        const nowTime = now.toTimeString().slice(0, 5); // HH:MM
        const currentSession = todaySessions.find((s) => s.startTime <= nowTime) ?? null;
        const nextSession = todaySessions.find((s) => s.startTime > nowTime) ?? null;

        const notifications = await notifRepo.findActive();
        const relevantNotifs = notifications.filter((n) => {
          if (n.scope === 'camp') return true;
          if (n.scope === 'zone') return actor.zone != null && n.zone === actor.zone;
          if (n.scope === 'church') return actor.churchId != null && n.churchId === actor.churchId;
          return false;
        });
        const latestNotif = relevantNotifs[0] ?? null;

        // Count check-ins due: campers without a check-in for today's sessions
        const checkInsDue = todaySessions.length > 0
          ? allCampers.filter((c) => {
              if (c.status === 'cancelled') return false;
              const hasCheckedInToday = c.checkInHistory.some((e) => {
                const session = todaySessions.find((s) => s.id === e.sessionId);
                return session && e.type === 'in';
              });
              return !hasCheckedInToday;
            }).length
          : 0;

        const dashboard: AtCampDashboard = {
          mode: 'at-camp',
          campName: settings.campName,
          greetingName: actor.displayName.split(' ')[0] ?? actor.displayName,
          totalAtCamp: atCampers.length,
          totalExpected,
          checkInsDue,
          currentSession: currentSession
            ? { id: currentSession.id, label: currentSession.title, day: currentSession.day, startTime: currentSession.startTime }
            : null,
          nextSession: nextSession
            ? { id: nextSession.id, label: nextSession.title, day: nextSession.day, startTime: nextSession.startTime }
            : null,
          latestNotification: latestNotif
            ? { title: latestNotif.title, body: latestNotif.body, priority: latestNotif.priority, createdAt: latestNotif.createdAt }
            : null,
        };

        return dashboard;
      }
    },
  };
}
