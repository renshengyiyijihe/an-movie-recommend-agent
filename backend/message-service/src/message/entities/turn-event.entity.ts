import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { TurnEntity } from "./turn.entity";

@Entity({ name: "turn_events" })
@Index("turn_events_turn_seq_uidx", ["turn_id", "seq"], { unique: true })
export class TurnEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "turn_id", type: "uuid" })
  turn_id!: string;

  @ManyToOne(() => TurnEntity, (turn: TurnEntity) => turn.events, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "turn_id" })
  turn!: TurnEntity;

  @Column({ name: "seq", type: "int" })
  seq!: number;

  @Column({ name: "body", type: "jsonb" })
  body!: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  created_at!: Date;
}
