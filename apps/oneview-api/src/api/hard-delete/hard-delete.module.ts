import { Module } from "@nestjs/common";
import { HardDeleteController } from "./hard-delete.controller";
import { HardDeleteService } from "./hard-delete.service";

@Module({
  controllers: [HardDeleteController],
  providers: [HardDeleteService],
})
export class HardDeleteModule {}
