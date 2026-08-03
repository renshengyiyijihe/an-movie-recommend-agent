import { Body, Controller, Headers, Post } from '@nestjs/common';
import { NoodleService } from './noodle.service';

@Controller('/noodle')
export class NoodleController {
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
    return this.noodleService.recommend(payload, authorization);
  }
}
