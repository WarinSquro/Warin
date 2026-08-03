import { Module } from "@nestjs/common";
import { CockpitController } from "./cockpit.controller";

@Module({ controllers: [CockpitController] })
export class CockpitModule {}
