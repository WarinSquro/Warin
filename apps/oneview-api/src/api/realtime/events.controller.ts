import { Controller, MessageEvent, Sse } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Observable, map } from "rxjs";
import { DomainEventsService } from "./domain-events.service";

@ApiTags("events")
@ApiBearerAuth()
@Controller("events")
export class EventsController {
  constructor(private readonly events: DomainEventsService) {}

  /**
   * Server-Sent Events stream of domain data-change notifications.
   * Auth: `Authorization: Bearer` or `?access_token=` (EventSource cannot set headers).
   */
  @Sse("stream")
  stream(): Observable<MessageEvent> {
    return this.events.asObservable().pipe(
      map(
        (payload) =>
          ({
            type: "data-changed",
            data: payload,
          }) satisfies MessageEvent
      )
    );
  }
}
