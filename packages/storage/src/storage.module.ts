import { DynamicModule, Global, Module } from "@nestjs/common";
import { AzureStorageDriver } from "./drivers/azure.driver";
import { FilesystemStorageDriver } from "./drivers/filesystem.driver";
import { S3StorageDriver } from "./drivers/s3.driver";
import { StorageService } from "./storage.service";
import { STORAGE_DRIVER, STORAGE_OPTIONS, type StorageModuleOptions, type StorageDriver } from "./types";

function createDriver(options: StorageModuleOptions): StorageDriver {
  const provider = options.provider ?? "filesystem";
  switch (provider) {
    case "filesystem":
      return new FilesystemStorageDriver(
        options.filesystem ?? { rootDir: process.env.STORAGE_ROOT ?? "./data/files" }
      );
    case "s3":
      if (!options.s3) throw new Error("StorageModule: s3 options required when provider=s3");
      return new S3StorageDriver(options.s3);
    case "azure":
      if (!options.azure) throw new Error("StorageModule: azure options required when provider=azure");
      return new AzureStorageDriver(options.azure);
    default:
      throw new Error(`Unknown storage provider: ${provider as string}`);
  }
}

@Global()
@Module({})
export class StorageModule {
  static forRoot(options: StorageModuleOptions = {}): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        { provide: STORAGE_OPTIONS, useValue: options },
        { provide: STORAGE_DRIVER, useFactory: () => createDriver(options) },
        StorageService,
      ],
      exports: [StorageService, STORAGE_DRIVER],
    };
  }
}
