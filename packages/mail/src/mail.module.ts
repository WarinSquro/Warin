import { DynamicModule, Global, Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { MAIL_OPTIONS, type MailModuleOptions } from "./types";

@Global()
@Module({})
export class MailModule {
  static forRoot(options: MailModuleOptions = {}): DynamicModule {
    const provider = options.provider ?? (options.dryRun === false ? "smtp" : "console");
    return {
      module: MailModule,
      providers: [
        {
          provide: MAIL_OPTIONS,
          useValue: {
            dryRun: options.dryRun ?? provider === "console",
            provider,
            from: options.from ?? "noreply@oneview.local",
            smtp: options.smtp,
          } satisfies MailModuleOptions,
        },
        MailService,
      ],
      exports: [MailService],
    };
  }
}
