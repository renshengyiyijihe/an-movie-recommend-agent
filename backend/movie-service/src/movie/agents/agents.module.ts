import { Module } from "@nestjs/common";
import { OrchestratorAgent } from "./orchestrator.agent";
import { SearchAgent } from "./search.agent";
import { RelationAgent } from "./relation.agent";
import { ToolsRegistry } from "./tools/tools.registry";
import { MovieDetailTool } from "./tools/movie-detail.tool";
import { MovieDiscoverTool } from "./tools/movie-discover.tool";
import { MovieSearchTool } from "./tools/movie-search.tool";
import { PersonDetailTool } from "./tools/person-detail.tool";
import { PersonSearchTool } from "./tools/person-search.tool";
import { ServicesModule } from "../services/services.module";

@Module({
  imports: [ServicesModule],
  providers: [
    MovieDetailTool,
    MovieDiscoverTool,
    MovieSearchTool,
    PersonDetailTool,
    PersonSearchTool,
    ToolsRegistry,
    SearchAgent,
    RelationAgent,
    OrchestratorAgent,
  ],
  exports: [OrchestratorAgent, SearchAgent, RelationAgent, ToolsRegistry],
})
export class AgentsModule {}
