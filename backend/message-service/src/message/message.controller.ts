import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "@an-movie/auth-client";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { MessageService } from "./message.service";

@UseGuards(JwtAuthGuard)
@Controller("message")
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post("conversations")
  async createConversation(@Body() body?: CreateConversationDto) {
    return this.messageService.createConversation(body?.title);
  }

  @Get("conversations")
  async listConversations() {
    return this.messageService.listConversations();
  }

  @Get("conversations/:id")
  async getConversation(@Param("id") id: string) {
    return this.messageService.getConversation(id);
  }
}
