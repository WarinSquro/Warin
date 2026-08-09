import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DataChangeInterceptor } from "./data-change.interceptor";
import { DomainEventsService } from "./domain-events.service";
import { EventsController } from "./events.controller";

@Global()
@Module({
  controllers: [EventsController],
  providers: [
    DomainEventsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: DataChangeInterceptor,
    },
  ],
  exports: [DomainEventsService],
})
export class RealtimeModule {}
