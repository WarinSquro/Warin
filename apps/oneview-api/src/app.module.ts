import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { SecurityModule } from "@oneview/security";
import { RedisModule } from "@oneview/redis";
import { StorageModule } from "@oneview/storage";
import { MailModule } from "@oneview/mail";
import { PrismaModule } from "./infrastructure/prisma/prisma.module";
import { HealthController } from "./api/health/health.controller";
import { AuthModule } from "./api/auth/auth.module";
import { MastersModule } from "./api/masters/masters.module";
import { EmployeesModule } from "./api/employees/employees.module";
import { ProjectsModule } from "./api/projects/projects.module";
import { SettingsModule } from "./api/settings/settings.module";
import { AccessRightsModule } from "./api/access-rights/access-rights.module";
import { CockpitModule } from "./api/cockpit/cockpit.module";
import { AllocationsModule } from "./api/allocations/allocations.module";
import { ConfirmationsModule } from "./api/confirmations/confirmations.module";
import { WeeklyCheckInModule } from "./api/weekly-check-in/weekly-check-in.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    SecurityModule.forRoot({
      hmacPepper: process.env.HMAC_PEPPER ?? "warin-dev-pepper-change-me",
    }),
    RedisModule.forRoot({
      url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    }),
    StorageModule.forRoot({
      provider: (process.env.STORAGE_PROVIDER as "filesystem" | "s3" | "azure") ?? "filesystem",
      filesystem: { rootDir: process.env.STORAGE_ROOT ?? "./data/files" },
    }),
    MailModule.forRoot({
      provider: (process.env.MAIL_PROVIDER as "smtp" | "console") ?? "console",
      dryRun: process.env.MAIL_DRY_RUN !== "false",
      from: process.env.MAIL_FROM ?? "noreply@warin.local",
      smtp: {
        host: process.env.MAIL_SMTP_HOST ?? "127.0.0.1",
        port: Number(process.env.MAIL_SMTP_PORT ?? 1025),
        secure: process.env.MAIL_SMTP_SECURE === "true",
        user: process.env.MAIL_SMTP_USER || undefined,
        pass: process.env.MAIL_SMTP_PASS || undefined,
      },
    }),
    PrismaModule,
    AuthModule,
    MastersModule,
    EmployeesModule,
    ProjectsModule,
    SettingsModule,
    AccessRightsModule,
    CockpitModule,
    AllocationsModule,
    ConfirmationsModule,
    WeeklyCheckInModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
