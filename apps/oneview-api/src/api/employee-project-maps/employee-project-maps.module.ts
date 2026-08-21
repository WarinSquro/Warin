import { Module } from "@nestjs/common";
import { EmployeeProjectMapsController } from "./employee-project-maps.controller";

@Module({ controllers: [EmployeeProjectMapsController] })
export class EmployeeProjectMapsModule {}
