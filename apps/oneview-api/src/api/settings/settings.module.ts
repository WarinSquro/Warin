import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsScheduleService } from "./settings-schedule.service";
import { SmtpSettingsController } from "./smtp-settings.controller";
import { SmtpSettingsService } from "./smtp-settings.service";

@Module({
  controllers: [SettingsController, SmtpSettingsController],
  providers: [SettingsScheduleService, SmtpSettingsService],
  exports: [SettingsScheduleService, SmtpSettingsService],
})
export class SettingsModule {}
