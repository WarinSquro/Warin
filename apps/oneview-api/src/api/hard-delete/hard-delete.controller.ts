import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { SuperAdminGuard } from "../auth/guards";
import type { JwtPayload } from "../auth/jwt.strategy";
import { EmitDataChange } from "../realtime/emit-data-change.decorator";
import { HardDeleteRequestDto } from "./hard-delete.dto";
import { HardDeleteService } from "./hard-delete.service";

@ApiTags("admin-hard-delete")
@ApiBearerAuth()
@UseGuards(SuperAdminGuard)
@Throttle({ default: { limit: 8, ttl: 60_000 } })
@Controller("admin/hard-delete")
export class HardDeleteController {
  constructor(private readonly hardDelete: HardDeleteService) {}

  @Post("employees")
  @EmitDataChange("employees", "delete")
  async employee(@Req() req: { user: JwtPayload }, @Body() body: HardDeleteRequestDto) {
    await this.hardDelete.assertAdminCredentials(req.user, body.email, body.pin);
    return this.hardDelete.deleteEmployee(req.user, body.id.trim());
  }

  @Post("projects")
  @EmitDataChange("projects", "delete")
  async project(@Req() req: { user: JwtPayload }, @Body() body: HardDeleteRequestDto) {
    await this.hardDelete.assertAdminCredentials(req.user, body.email, body.pin);
    return this.hardDelete.deleteProject(body.id.trim());
  }

  @Post("departments")
  @EmitDataChange("masters", "delete")
  async department(@Req() req: { user: JwtPayload }, @Body() body: HardDeleteRequestDto) {
    await this.hardDelete.assertAdminCredentials(req.user, body.email, body.pin);
    return this.hardDelete.deleteDepartment(body.id.trim());
  }

  @Post("skills")
  @EmitDataChange("masters", "delete")
  async skill(@Req() req: { user: JwtPayload }, @Body() body: HardDeleteRequestDto) {
    await this.hardDelete.assertAdminCredentials(req.user, body.email, body.pin);
    return this.hardDelete.deleteSkill(body.id.trim());
  }

  @Post("activities")
  @EmitDataChange("masters", "delete")
  async activity(@Req() req: { user: JwtPayload }, @Body() body: HardDeleteRequestDto) {
    await this.hardDelete.assertAdminCredentials(req.user, body.email, body.pin);
    return this.hardDelete.deleteActivity(body.id.trim());
  }
}
