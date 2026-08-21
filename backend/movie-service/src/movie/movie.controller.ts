import { Body, Controller, Logger, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequestUser } from "../auth/user-context";
import { RecommendDto } from "./dto/recommend.dto";
import { MovieService } from "./movie.service";

@UseGuards(JwtAuthGuard)
@Controller("/movie")
export class MovieController {
  private readonly logger = new Logger(MovieController.name);

  constructor(private readonly movieService: MovieService) {}

  @Post("recommend")
  async recommend(
    @Body() payload: RecommendDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.logger.log(
      `recommend request: user=${user.id} messageLength=${payload.message?.length ?? 0}, hasImage=${Boolean(payload.imageUrl || payload.imageData)}`,
    );
    return this.movieService.recommend(payload);
  }
}
