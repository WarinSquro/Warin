import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

const UNIQUE_FIELD_MESSAGE: Record<string, string> = {
  name: "A record with this name already exists",
  code: "A record with this code already exists",
  email: "A record with this email already exists",
};

function messageForUniqueTarget(target: unknown): string {
  const fields = Array.isArray(target)
    ? target.map(String)
    : typeof target === "string"
      ? [target]
      : [];
  for (const field of fields) {
    const key = field.includes("_") ? field.split("_").pop()! : field;
    if (UNIQUE_FIELD_MESSAGE[key]) return UNIQUE_FIELD_MESSAGE[key];
    if (UNIQUE_FIELD_MESSAGE[field]) return UNIQUE_FIELD_MESSAGE[field];
  }
  if (fields.includes("name") || fields.some((f) => f.endsWith("_name") || f === "activities_name_key")) {
    return "A record with this name already exists";
  }
  return "A record with this value already exists";
}

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
      if (status === HttpStatus.UNAUTHORIZED) {
        const explicit = typeof body === "object" && body !== null ? (body as Record<string, unknown>).error : null;
        if (typeof explicit !== "string" || !explicit || explicit === "Unauthorized") {
          code = "UNAUTHORIZED";
        }
      }
      if (status === HttpStatus.FORBIDDEN) code = "FORBIDDEN";
      if (status === HttpStatus.NOT_FOUND) code = "NOT_FOUND";
      if (status === HttpStatus.BAD_REQUEST && code !== "VALIDATION_ERROR") code = "VALIDATION_ERROR";
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.error(`${exception.code}: ${exception.message}`, exception.stack);
      if (exception.code === "P2002") {
        status = HttpStatus.BAD_REQUEST;
        code = "VALIDATION_ERROR";
        message = messageForUniqueTarget(exception.meta?.target);
      } else if (exception.code === "P2025") {
        status = HttpStatus.NOT_FOUND;
        code = "NOT_FOUND";
        message = "Record not found";
      } else {
        message = process.env.NODE_ENV === "production" ? message : exception.message;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      message = process.env.NODE_ENV === "production" ? message : exception.message;
    }

    res.status(status).json({
      error: { code, message },
    });
  }
}
