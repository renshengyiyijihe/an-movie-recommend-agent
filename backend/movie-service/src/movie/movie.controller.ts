import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser, JwtAuthGuard, type RequestUser } from "@an-movie/auth-client";
import { CANCEL_REASON, STREAM_EVENT } from "@an-movie/contracts";
import { ChatDto } from "./dto/chat.dto";
import { CancelChatDto } from "./dto/cancel-chat.dto";
import { MovieService } from "./movie.service";
import { MESSAGE_CONSTANTS } from "./constants";
import { isAbortError } from "./errors/workflow-cancelled.error";
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
      if (isAbortError(error)) return;
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

  /**
   * 停止生成。不断开 SSE；本请求只 abort 工作流并 CAS 收口轮次，
   * `final` 仍由原来的 chat 流推。
   */
  @Post("chat/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(@Body() body: CancelChatDto): Promise<{ ok: true }> {
    await this.movieService.cancelTurn(
      body.turnId,
      body.reason ?? CANCEL_REASON.USER,
    );
    return { ok: true };
  }
}
