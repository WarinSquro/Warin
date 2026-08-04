export { MailModule } from "./mail.module";
export { MailService, SmtpNotConfiguredError } from "./mail.service";
export {
  MAIL_OPTIONS,
  SMTP_NOT_CONFIGURED_CODE,
  SMTP_NOT_CONFIGURED_MESSAGE,
  formatMailFrom,
  nodemailerOptionsFromProduct,
  type MailModuleOptions,
  type MailProvider,
  type ProductSmtpConfig,
  type SendMailInput,
  type SendMailResult,
  type SmtpOptions,
  type SmtpSecurityType,
} from "./types";
