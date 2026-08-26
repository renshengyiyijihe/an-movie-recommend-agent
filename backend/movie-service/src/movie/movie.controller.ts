import { Body, Controller, Logger, Post, Res, UseGuards } from "@nestjs/common";
import { CurrentUser, JwtAuthGuard, type RequestUser } from "@an-movie/auth-client";
import { STREAM_EVENT } from "@an-movie/contracts";
import { ChatDto } from "./dto/chat.dto";
import { MovieService } from "./movie.service";
import { MESSAGE_CONSTANTS } from "./constants";
import { openChatSse, type SseReply } from "./chat-stream";

@UseGuards(JwtAuthGuard)
@Controller("/movie")
export class MovieController {
  private readonly logger = new Logger(MovieController.name);

  constructor(private readonly movieService: MovieService) {}

  @Post("chat")
  async chat(
    @Body() payload: ChatDto,
    @CurrentUser() user: RequestUser,
    @Res() res: SseReply,
  ): Promise<void> {
    this.logger.log(
      `chat request: user=${user.id} messageLength=${payload.message?.length ?? 0}, hasImage=${Boolean(payload.imageUrl || payload.imageData)}`,
    );

    const stream = openChatSse(res);
    try {
      await this.movieService.chat(payload, stream.emit);
    } catch (error) {
      this.logger.error(
        `chat stream failed: ${error instanceof Error ? error.message : String(error)}`,
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
