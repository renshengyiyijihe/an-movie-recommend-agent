import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'conversations' })
export class ConversationEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'conversation_id' })
  conversation_id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  user_id!: string | null;

  @Column({ name: 'title', type: 'text', nullable: true })
  title!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @OneToMany(() => MessageEntity, (message: MessageEntity) => message.conversation)
  messages?: MessageEntity[];
}

@Entity({ name: 'messages' })
export class MessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ConversationEntity, (conversation: ConversationEntity) => conversation.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: ConversationEntity;

  @Column({ name: 'role', type: 'text' })
  role!: string;

  @Column({ name: 'message_type', type: 'text' })
  message_type!: string;

  @Column({ name: 'stage', type: 'text' })
  stage!: string;

  @Column({ name: 'content', type: 'text', nullable: true })
  content!: string | null;

  @Column({ name: 'user_message_id', type: 'uuid', nullable: true })
  user_message_id!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;
}
