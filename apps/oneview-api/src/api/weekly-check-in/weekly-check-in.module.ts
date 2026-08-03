import { Module } from "@nestjs/common";
import { WeeklyCheckInController } from "./weekly-check-in.controller";

@Module({ controllers: [WeeklyCheckInController] })
export class WeeklyCheckInModule {}
