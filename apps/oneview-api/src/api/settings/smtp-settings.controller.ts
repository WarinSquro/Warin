import { Body, Controller, Get, Post, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/guards";
import type { JwtPayload } from "../auth/jwt.strategy";
import {
  SmtpSettingsService,
  type SmtpSettingsUpdateDto,
} from "./smtp-settings.service";

@ApiTags("settings")
@ApiBearerAuth()
@Controller("settings/smtp")
export class SmtpSettingsController {
  constructor(private readonly smtp: SmtpSettingsService) {}

  @Get()
  @RequirePermissions("settings")
  get() {
    return this.smtp.getPublic();
  }

  @Put()
  @RequirePermissions("settings")
  update(@Body() body: SmtpSettingsUpdateDto, @Req() req: { user: JwtPayload }) {
    const actorId = req.user?.sub ? BigInt(req.user.sub) : undefined;
    return this.smtp.update(body, actorId);
  }

  @Post("test-connection")
  @RequirePermissions("settings")
  testConnection(@Body() body: SmtpSettingsUpdateDto) {
    return this.smtp.testConnection(body);
  }

  @Post("test-email")
  @RequirePermissions("settings")
  testEmail(@Body() body: SmtpSettingsUpdateDto & { to: string }) {
    return this.smtp.sendTestEmail(body);
  }
}
