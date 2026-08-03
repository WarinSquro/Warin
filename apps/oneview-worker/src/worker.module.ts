import { Injectable, Logger, Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MailModule, MailService } from "@oneview/mail";
import { RedisModule } from "@oneview/redis";
import { SecurityModule } from "@oneview/security";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { SettingsScheduleApplyService } from "./settings-schedule-apply.service";

@Injectable()
export class MailQueueService implements OnModuleInit {
  private readonly logger = new Logger(MailQueueService.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly mail: MailService) {}

  async onModuleInit() {
    const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
    const connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue("oneview-mail", { connection });
    this.worker = new Worker(
      "oneview-mail",
      async (job) => {
        this.logger.log(`Processing mail job ${job.id}`);
        await this.mail.send(job.data);
      },
      { connection: connection.duplicate() }
    );
    this.worker.on("completed", (job) => this.logger.log(`Mail job ${job.id} done`));
    this.worker.on("failed", (job, err) => this.logger.error(`Mail job ${job?.id} failed: ${err.message}`));
    this.logger.log("Mail queue worker ready");
  }

  async enqueue(data: Record<string, unknown>) {
    return this.queue?.add("send", data, { attempts: 3, backoff: { type: "exponential", delay: 2000 } });
  }
}

@Injectable()
export class HeartbeatService implements OnModuleInit {
  private readonly logger = new Logger(HeartbeatService.name);

  onModuleInit() {
    setInterval(() => {
      this.logger.debug(`heartbeat ${new Date().toISOString()}`);
    }, 60_000);
    this.logger.log("Heartbeat scheduled");
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SecurityModule.forRoot({}),
    RedisModule.forRoot({ url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379" }),
    MailModule.forRoot({ provider: "console", dryRun: true }),
  ],
  providers: [MailQueueService, HeartbeatService, SettingsScheduleApplyService],
})
export class WorkerModule {}
