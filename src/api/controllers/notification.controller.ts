import type { HttpRequest } from '../http/types';
import type { NotificationService } from '../../services/notification.service';
import { UnauthorizedError } from '../../core/errors/app-error';

export interface NotificationControllerServices {
  notification: NotificationService;
}

export function makeNotificationController(services: NotificationControllerServices) {
  return {
    async feed(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.notification.feed(req.ctx.actor);
    },

    async latest(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.notification.latest(req.ctx.actor);
    },

    async send(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.notification.send(req.ctx.actor, req.body);
    },
  };
}
