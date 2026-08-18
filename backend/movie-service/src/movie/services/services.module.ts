import { Module } from "@nestjs/common";
import { TmdbProvider } from "../../model/tmdb.provider";
import { PromptTemplateService } from "./prompt-template.service";
import { MovieSearchService } from "./movie-search.service";
import { RelationAnalysisService } from "./relation-analysis.service";

/**
 * 服务模块
 * 统一管理所有业务服务
 */
@Module({
  providers: [
    PromptTemplateService,
    MovieSearchService,
    RelationAnalysisService,
    TmdbProvider,
  ],
  exports: [
    PromptTemplateService,
    MovieSearchService,
    RelationAnalysisService,
    TmdbProvider,
  ],
})
export class ServicesModule {}
