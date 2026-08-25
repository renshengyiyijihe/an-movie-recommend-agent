import { Body, Controller, Logger, Post, Res, UseGuards } from "@nestjs/common";
import { CurrentUser, JwtAuthGuard, type RequestUser } from "@an-movie/auth-client";
import { STREAM_EVENT } from "@an-movie/contracts";
import { RecommendDto } from "./dto/recommend.dto";
import { MovieService } from "./movie.service";
import { MESSAGE_CONSTANTS } from "./constants";
import { openRecommendSse, type SseReply } from "./recommend-stream";

@UseGuards(JwtAuthGuard)
@Controller("/movie")
export class MovieController {
  private readonly logger = new Logger(MovieController.name);

  constructor(private readonly movieService: MovieService) {}

  @Post("recommend")
  async recommend(
    @Body() payload: RecommendDto,
    @CurrentUser() user: RequestUser,
    @Res() res: SseReply,
  ): Promise<void> {
    this.logger.log(
      `recommend request: user=${user.id} messageLength=${payload.message?.length ?? 0}, hasImage=${Boolean(payload.imageUrl || payload.imageData)}`,
    );

    const stream = openRecommendSse(res);
    try {
      await this.movieService.recommend(payload, stream.emit);
    } catch (error) {
      this.logger.error(
        `recommend stream failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      stream.emit({
        event: STREAM_EVENT.ERROR,
        message: MESSAGE_CONSTANTS.UNEXPECTED_FAILURE,
      });
    } finally {
      stream.close();
    }
  }
}
