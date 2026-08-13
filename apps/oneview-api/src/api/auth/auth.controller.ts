import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import {
  ChangePinDto,
  ForgotPinDto,
  LoginContinueDto,
  LoginDto,
  RefreshDto,
  ResetPinDto,
  VerifyPinDto,
} from "./dto/auth.dto";
import { JwtAuthGuard, Public } from "./guards";
import type { JwtPayload } from "./jwt.strategy";
import { parseSessionClientMeta } from "./session-client-meta";

function clientMetaFromRequest(req: Request) {
  const xf = req.headers["x-forwarded-for"];
  const forwarded = Array.isArray(xf) ? xf[0] : xf;
  const ip = forwarded || req.ip || req.socket?.remoteAddress || null;
  const ua = req.headers["user-agent"] ?? null;
  return parseSessionClientMeta(ua, ip);
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.pin, clientMetaFromRequest(req));
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("login/continue")
  continueLogin(@Body() dto: LoginContinueDto, @Req() req: Request) {
    return this.auth.continueLogin(dto.continueToken, clientMetaFromRequest(req));
  }

  @Public()
  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refreshTokens(dto.refreshToken);
  }

  @Public()
  @Post("logout")
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("forgot-pin")
  forgotPin(@Body() dto: ForgotPinDto) {
    return this.auth.forgotPin(dto.email);
  }

  @Public()
  @Post("reset-pin")
  resetPin(@Body() dto: ResetPinDto) {
    return this.auth.resetPin(dto.token, dto.pin);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: { user: JwtPayload }) {
    return this.auth.me(req.user.sub);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("verify-pin")
  verifyPin(@Req() req: { user: JwtPayload }, @Body() dto: VerifyPinDto) {
    return this.auth.verifyCurrentPin(req.user.sub, dto.pin);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("change-pin")
  changePin(@Req() req: { user: JwtPayload }, @Body() dto: ChangePinDto) {
    return this.auth.changePin(req.user.sub, dto.currentPin, dto.newPin);
  }
}
