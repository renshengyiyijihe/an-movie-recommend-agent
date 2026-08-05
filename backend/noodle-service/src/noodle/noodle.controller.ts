import { Body, Controller, Headers, Logger, Post } from '@nestjs/common';
import { NoodleService } from './noodle.service';

@Controller('/noodle')
export class NoodleController {
  private readonly logger = new Logger(NoodleController.name);

  constructor(private readonly noodleService: NoodleService) {}

  @Post('recommend')
  async recommend(
    @Body() payload: {
      message: string;
      imageUrl?: string;
      imageData?: string;
    },
    @Headers('authorization') authorization?: string,
  ) {
    this.logger.log(`recommend request: messageLength=${payload.message?.length ?? 0}, hasImage=${Boolean(payload.imageUrl || payload.imageData)}, authorization=${authorization ? 'present' : 'none'}`);
    return this.noodleService.recommend(payload, authorization);
  }
}
