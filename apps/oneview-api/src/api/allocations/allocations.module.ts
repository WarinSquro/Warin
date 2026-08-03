import { Module } from "@nestjs/common";
import { AllocationsController } from "./allocations.controller";

@Module({ controllers: [AllocationsController] })
export class AllocationsModule {}
