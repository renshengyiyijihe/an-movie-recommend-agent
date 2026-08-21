import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ConversationEntity } from "./conversation.entity";
import { MessageEntity } from "./message.entity";
import { TurnEventEntity } from "./turn-event.entity";

export const TURN_STATUSES = ["running", "success", "reject", "error"] as const;
export type TurnStatus = (typeof TURN_STATUSES)[number];
export const FINISHED_TURN_STATUSES: TurnStatus[] = [
  "success",
  "reject",
  "error",
];

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
