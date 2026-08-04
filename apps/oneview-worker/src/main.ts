import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const logger = new Logger("Worker");
  logger.log("Warin worker started (mail + cleanup queues)");
  // Keep process alive
  process.on("SIGINT", async () => {
    await app.close();
    process.exit(0);
  });
}

bootstrap();
