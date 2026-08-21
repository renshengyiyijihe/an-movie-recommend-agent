export class ConversationChatItemDto {
  id!: string;
  turn_id!: string;
  role!: string;
  kind!: string;
  payload!: Record<string, unknown>;
  created_at!: string;
}

export class ConversationDetailDto {
  conversation_id!: string;
  user_id?: string | null;
  title?: string | null;
  messages: ConversationChatItemDto[] = [];
}
