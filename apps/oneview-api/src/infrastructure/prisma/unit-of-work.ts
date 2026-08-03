import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/** Thin Unit of Work over Prisma interactive transactions. */
@Injectable()
export class UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(fn: (tx: PrismaService) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx as unknown as PrismaService));
  }
}
