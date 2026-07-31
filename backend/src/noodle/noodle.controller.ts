import { Body, Controller, Post } from '@nestjs/common';
import { NoodleService } from './noodle.service';

@Controller('api/noodle')
export class NoodleController {
  constructor(private readonly noodleService: NoodleService) {}

  @Post('recommend')
  async recommend(
    @Body()
    payload: {
      message: string;
      imageUrl?: string;
      imageData?: string;
    },
  ) {
    return this.noodleService.recommend(payload);
  }
}
