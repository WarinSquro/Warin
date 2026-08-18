import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./infrastructure/filters/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  const logger = new Logger("Bootstrap");

  // Trust private reverse-proxy hops (Compose nginx, host nginx) so req.ip is the
  // real client. Do not trust all proxies — that would honor a spoofed X-Forwarded-For.
  app.getHttpAdapter().getInstance().set("trust proxy", ["loopback", "linklocal", "uniquelocal"]);

  // POC email snaps are stored as data URLs in project payloads (TEXT column).
  app.use(json({ limit: "5mb" }));
  app.use(urlencoded({ extended: true, limit: "5mb" }));

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4173",
      "http://127.0.0.1:4173",
    ],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swagger = new DocumentBuilder()
    .setTitle("Warin API")
    .setDescription("Resource Management System API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
  logger.log(`Warin API listening on :${port}`);
}

bootstrap();
