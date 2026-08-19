import { Module } from "@nestjs/common";
import { OrchestratorAgent } from "./orchestrator.agent";
import { SearchAgent } from "./search.agent";
import { RelationAgent } from "./relation.agent";
import { ToolsRegistry } from "./tools/tools.registry";
import { MovieDetailTool } from "./tools/movie-detail.tool";
import { PersonInfoTool } from "./tools/person-info.tool";
import { PersonWorkTool } from "./tools/person-work.tool";
import { MovieRecommendTool } from "./tools/movie-recommend.tool";
import { TmdbProvider } from "../../model/tmdb.provider";
import { ServicesModule } from "../services/services.module";

@Module({
  imports: [ServicesModule],
  providers: [
    // Tools
    MovieDetailTool,
    PersonInfoTool,
    PersonWorkTool,
    MovieRecommendTool,
    ToolsRegistry,
    
    // Agents
    SearchAgent,
    RelationAgent,
    OrchestratorAgent,
    
    // External dependencies
    TmdbProvider,
  ],
  exports: [OrchestratorAgent, SearchAgent, RelationAgent, ToolsRegistry],
})
export class AgentsModule {}
