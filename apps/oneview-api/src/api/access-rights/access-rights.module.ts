import { Module } from "@nestjs/common";
import { AccessRightsController } from "./access-rights.controller";

@Module({ controllers: [AccessRightsController] })
export class AccessRightsModule {}
