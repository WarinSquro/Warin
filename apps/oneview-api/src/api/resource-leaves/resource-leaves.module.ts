import { Module } from "@nestjs/common";
import { ResourceLeavesController } from "./resource-leaves.controller";

@Module({
  controllers: [ResourceLeavesController],
})
export class ResourceLeavesModule {}
