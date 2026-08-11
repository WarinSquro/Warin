import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard, PermissionsGuard } from "./guards";
import { JwtStrategy } from "./jwt.strategy";
import { SessionAuthCache } from "./session-auth.cache";

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? "warin-dev-jwt-secret-change-me",
      signOptions: {
        expiresIn: Number(process.env.JWT_EXPIRES_SECONDS ?? 3600),
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionAuthCache,
    JwtStrategy,
    PermissionsGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, SessionAuthCache],
})
export class AuthModule {}
