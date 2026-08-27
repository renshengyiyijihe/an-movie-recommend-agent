import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { TurnStatus } from "@an-movie/contracts";
import { ConversationEntity } from "./conversation.entity";
import { MessageEntity } from "./message.entity";
import { TurnEventEntity } from "./turn-event.entity";

@Entity({ name: "turns" })
export class TurnEntity {
  @PrimaryGeneratedColumn("uuid", { name: "turn_id" })
  turn_id!: string;

  @Column({ name: "conversation_id", type: "uuid" })
  conversation_id!: string;

  @ManyToOne(
    () => ConversationEntity,
    (conversation: ConversationEntity) => conversation.turns,
    { onDelete: "CASCADE" },
  )
  @JoinColumn({ name: "conversation_id" })
  conversation!: ConversationEntity;

  @Column({ name: "status", type: "text" })
  status!: TurnStatus;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  created_at!: Date;

  @Column({ name: "finished_at", type: "timestamptz", nullable: true })
  finished_at!: Date | null;

  @OneToMany(() => MessageEntity, (message: MessageEntity) => message.turn)
  messages?: MessageEntity[];

  @OneToMany(() => TurnEventEntity, (event: TurnEventEntity) => event.turn)
  events?: TurnEventEntity[];
}
