import { Body, Controller, Headers, Logger, Post } from '@nestjs/common';
import { MovieService } from './movie.service';

@Controller('/movie')
export class MovieController {
  private readonly logger = new Logger(MovieController.name);

  constructor(private readonly movieService: MovieService) {}

  @Post('recommend')
  async recommend(
    @Body() payload: {
      message: string;
      imageUrl?: string;
      imageData?: string;
      conversationId?: string;
    },
    @Headers('authorization') authorization?: string,
  ) {
    this.logger.log(`recommend request: messageLength=${payload.message?.length ?? 0}, hasImage=${Boolean(payload.imageUrl || payload.imageData)}, authorization=${authorization ? 'present' : 'none'}`);
    return this.movieService.recommend(payload, authorization);
  }
}
