import { Module } from "@nestjs/common";
import { TeamProjectsController } from "./team-projects.controller";

@Module({ controllers: [TeamProjectsController] })
export class TeamProjectsModule {}
