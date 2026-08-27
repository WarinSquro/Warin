import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { Public } from "../auth/guards";

const APP_TZ = () => process.env.APP_DISPLAY_TIMEZONE || "Asia/Kolkata";

/** Calendar date in product timezone (IST by default). */
export function todayIsoInAppTz(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    let database: "up" | "down" = "down";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = "up";
    } catch {
      database = "down";
    }
    const now = new Date();
    return {
      status: database === "up" ? "ok" : "degraded",
      service: "warin-api",
      database,
      timestamp: now.toISOString(),
    };
  }

  /**
   * Authoritative server clock for Workday Timeline stamps and “today” (IST).
   * Public so the SPA can stamp even when only confirming own day.
   */
  @Public()
  @Get("clock")
  clock() {
    const now = new Date();
    return {
      nowIso: now.toISOString(),
      todayIst: todayIsoInAppTz(now),
      timeZone: APP_TZ(),
    };
  }
}
