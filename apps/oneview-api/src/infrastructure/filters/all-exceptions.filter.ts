import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "An unexpected error occurred";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (typeof body === "object" && body !== null) {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string) ?? message;
        code = (obj.error as string) ?? HttpStatus[status] ?? code;
        if (Array.isArray(obj.message)) {
          message = obj.message.join("; ");
          code = "VALIDATION_ERROR";
        }
      }
      if (status === HttpStatus.UNAUTHORIZED) code = "UNAUTHORIZED";
      if (status === HttpStatus.FORBIDDEN) code = "FORBIDDEN";
      if (status === HttpStatus.NOT_FOUND) code = "NOT_FOUND";
      if (status === HttpStatus.BAD_REQUEST && code !== "VALIDATION_ERROR") code = "VALIDATION_ERROR";
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      message = process.env.NODE_ENV === "production" ? message : exception.message;
    }

    res.status(status).json({
      error: { code, message },
    });
  }
}
