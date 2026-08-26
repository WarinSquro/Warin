import { Module } from "@nestjs/common";
import { DecisionPointsController } from "./decision-points.controller";

@Module({ controllers: [DecisionPointsController] })
export class DecisionPointsModule {}
