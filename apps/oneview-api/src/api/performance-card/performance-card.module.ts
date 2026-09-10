import { Module } from "@nestjs/common";
import { PerformanceCardController } from "./performance-card.controller";

@Module({ controllers: [PerformanceCardController] })
export class PerformanceCardModule {}
