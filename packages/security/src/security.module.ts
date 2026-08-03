import { DynamicModule, Global, Module } from "@nestjs/common";
import { CryptoService, HashingService, MaskingService } from "./services";
import { SECURITY_OPTIONS, type SecurityModuleOptions } from "./types";

@Global()
@Module({})
export class SecurityModule {
  static forRoot(options: SecurityModuleOptions = {}): DynamicModule {
    return {
      module: SecurityModule,
      providers: [
        { provide: SECURITY_OPTIONS, useValue: options },
        HashingService,
        CryptoService,
        MaskingService,
      ],
      exports: [HashingService, CryptoService, MaskingService],
    };
  }
}
