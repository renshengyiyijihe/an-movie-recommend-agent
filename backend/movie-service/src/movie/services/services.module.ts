import { Module } from "@nestjs/common";
import { TmdbProvider } from "../../model/tmdb.provider";
import { PromptTemplateService } from "./prompt-template.service";

/**
 * 服务模块
 * 统一管理所有业务服务
 */
@Module({
  providers: [
    PromptTemplateService,
    TmdbProvider,
  ],
  exports: [
    PromptTemplateService,
    TmdbProvider,
  ],
})
export class ServicesModule {}
