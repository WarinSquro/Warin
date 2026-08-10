import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { ChangePinDto, ForgotPinDto, LoginDto, RefreshDto, ResetPinDto, VerifyPinDto } from "./dto/auth.dto";
import { JwtAuthGuard, Public } from "./guards";
import type { JwtPayload } from "./jwt.strategy";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.pin);
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
