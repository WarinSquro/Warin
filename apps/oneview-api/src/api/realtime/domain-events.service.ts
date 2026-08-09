import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { RedisService } from "@oneview/redis";
import type Redis from "ioredis";
import { Observable, Subject } from "rxjs";
import {
  DATA_CHANGE_CHANNEL,
  type DataChangeAction,
  type DataChangedEvent,
  type DataResource,
} from "./data-change.types";

@Injectable()
export class DomainEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainEventsService.name);
  private subscriber: Redis | null = null;
  private readonly subject = new Subject<DataChangedEvent>();

  constructor(private readonly redis: RedisService) {}

  async onModuleInit() {
    try {
      this.subscriber = this.redis.createSubscriber();
      this.subscriber.on("message", (channel, message) => {
        if (channel !== DATA_CHANGE_CHANNEL) return;
        try {
          const parsed = JSON.parse(message) as DataChangedEvent;
          if (parsed?.v === 1 && parsed.resource) {
            this.subject.next(parsed);
          }
        } catch {
          /* ignore malformed */
        }
      });
      await this.subscriber.subscribe(DATA_CHANGE_CHANNEL);
      this.logger.log(`Subscribed to ${DATA_CHANGE_CHANNEL}`);
    } catch (e) {
      this.logger.warn(
        `Realtime Redis subscribe failed — SSE will be idle until Redis is available: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  async onModuleDestroy() {
    this.subject.complete();
    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe(DATA_CHANGE_CHANNEL);
        await this.subscriber.quit();
      } catch {
        /* ignore */
      }
      this.subscriber = null;
    }
  }

  asObservable(): Observable<DataChangedEvent> {
    return this.subject.asObservable();
  }

  async publish(resource: DataResource, action: DataChangeAction, actorId?: string): Promise<void> {
    const payload: DataChangedEvent = {
      v: 1,
      resource,
      action,
      at: new Date().toISOString(),
      ...(actorId ? { actorId } : {}),
    };
    try {
      await this.redis.publish(DATA_CHANGE_CHANNEL, JSON.stringify(payload));
    } catch (e) {
      this.logger.warn(
        `Failed to publish data-change (${resource}/${action}): ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }
}
