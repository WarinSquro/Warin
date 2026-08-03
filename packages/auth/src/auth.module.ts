import { DynamicModule, Global, Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards";
import { AUTH_OPTIONS, type AuthModuleOptions } from "./types";

@Global()
@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions = {}): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        { provide: AUTH_OPTIONS, useValue: options },
        AuthService,
        JwtAuthGuard,
      ],
      exports: [AuthService, JwtAuthGuard],
    };
  }
}
