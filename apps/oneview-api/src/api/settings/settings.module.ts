import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsScheduleService } from "./settings-schedule.service";

@Module({
  controllers: [SettingsController],
  providers: [SettingsScheduleService],
  exports: [SettingsScheduleService],
})
export class SettingsModule {}
