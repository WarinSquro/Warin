import { Module } from "@nestjs/common";
import { CostAnalyzerController } from "./cost-analyzer.controller";
import { CostAnalyzerService } from "./cost-analyzer.service";

@Module({
  controllers: [CostAnalyzerController],
  providers: [CostAnalyzerService],
})
export class CostAnalyzerModule {}
