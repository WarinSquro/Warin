import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, tap } from "rxjs";
import type { JwtPayload } from "../auth/jwt.strategy";
import { DomainEventsService } from "./domain-events.service";
import { DATA_CHANGE_KEY, type EmitDataChangeMeta } from "./emit-data-change.decorator";

@Injectable()
export class DataChangeInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly events: DomainEventsService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<EmitDataChangeMeta | undefined>(DATA_CHANGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const actorId = req.user?.sub;

    return next.handle().pipe(
      tap({
        next: () => {
          void this.events.publish(meta.resource, meta.action, actorId);
        },
      })
    );
  }
}
