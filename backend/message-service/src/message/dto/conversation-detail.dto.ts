export class ConversationMessageDto {
  id!: string;
  role!: string;
  message_type!: string;
  stage!: string;
  content!: string;
  created_at!: string;
}

export class ConversationDetailDto {
  conversation_id!: string;
  user_id?: string | null;
  title?: string | null;
  messages: ConversationMessageDto[] = [];
}
