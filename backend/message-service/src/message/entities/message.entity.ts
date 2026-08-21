import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ConversationEntity } from "./conversation.entity";
import { TurnEntity } from "./turn.entity";

@Entity({ name: "messages" })
export class MessageEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "conversation_id", type: "uuid" })
  conversation_id!: string;

  @ManyToOne(
    () => ConversationEntity,
    (conversation: ConversationEntity) => conversation.messages,
    { onDelete: "CASCADE" },
  )
  @JoinColumn({ name: "conversation_id" })
  conversation!: ConversationEntity;

  @Column({ name: "turn_id", type: "uuid" })
  turn_id!: string;

  @ManyToOne(() => TurnEntity, (turn: TurnEntity) => turn.messages, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "turn_id" })
  turn!: TurnEntity;

  @Column({ name: "role", type: "text" })
  role!: "user" | "assistant";

  @Column({ name: "content", type: "jsonb" })
  content!: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  created_at!: Date;
}
