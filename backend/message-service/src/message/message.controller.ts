import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { MessageService } from './message.service';

@Controller('message')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post('conversations')
  async createConversation(
    @Headers('authorization') authorization?: string,
    @Body() body?: CreateConversationDto,
  ) {
    const authResult = await this.messageService.validateAuthorization(authorization);
    if (!authResult.ok) {
      throw new UnauthorizedException('未授权，请先登录');
    }
    return this.messageService.createConversation(authResult.user?.id, body?.title);
  }

  @Get('conversations')
  async listConversations(@Headers('authorization') authorization?: string) {
    const authResult = await this.messageService.validateAuthorization(authorization);
    if (!authResult.ok) {
      throw new UnauthorizedException('未授权，请先登录');
    }
    return this.messageService.listConversations(authResult.user.id);
  }

  @Get('conversations/:id')
  async getConversation(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const authResult = await this.messageService.validateAuthorization(authorization);
    if (!authResult.ok) {
      throw new UnauthorizedException('未授权，请先登录');
    }
    return this.messageService.getConversation(id, authResult.user.id);
  }
}
