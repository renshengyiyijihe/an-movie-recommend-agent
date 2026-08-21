import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { MessageEntity } from "./message.entity";
import { TurnEntity } from "./turn.entity";

@Entity({ name: "conversations" })
export class ConversationEntity {
  @PrimaryGeneratedColumn("uuid", { name: "conversation_id" })
  conversation_id!: string;

  @Column({ name: "user_id", type: "uuid", nullable: true })
  user_id!: string | null;

  @Column({ name: "title", type: "text", nullable: true })
  title!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updated_at!: Date;

  @OneToMany(() => TurnEntity, (turn: TurnEntity) => turn.conversation)
  turns?: TurnEntity[];

  @OneToMany(() => MessageEntity, (message: MessageEntity) => message.conversation)
  messages?: MessageEntity[];
}
