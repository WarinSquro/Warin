import { Module } from "@nestjs/common";
import { ConfirmationsController } from "./confirmations.controller";

@Module({ controllers: [ConfirmationsController] })
export class ConfirmationsModule {}
