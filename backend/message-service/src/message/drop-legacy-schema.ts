import { Logger } from "@nestjs/common";
import { DataSource } from "typeorm";

const logger = new Logger("DropLegacyMessageSchema");

const MESSAGE_TABLES = ["turn_events", "messages", "turns", "conversations"];

/**
 * 旧 messages 表带 message_type/stage，content 还是 text。
 * TypeORM synchronize 改不成 JSONB，启动前若检测到旧结构就整表丢掉，让 sync 重建。
 * 用户表不动。
 */
export async function dropLegacyMessageSchema(postgresUrl: string): Promise<void> {
  const bootstrap = new DataSource({
    type: "postgres",
    url: postgresUrl,
    synchronize: false,
  });

  await bootstrap.initialize();
  try {
    const legacyColumns: Array<{ column_name: string }> = await bootstrap.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'messages'
        AND column_name IN ('message_type', 'stage', 'user_message_id')
      `,
    );

    if (legacyColumns.length === 0) {
      logger.log("No legacy messages schema detected, skip drop");
      return;
    }

    logger.warn(
      `Legacy messages columns found: ${legacyColumns
        .map((row) => row.column_name)
        .join(", ")}. Dropping message tables.`,
    );

    for (const table of MESSAGE_TABLES) {
      await bootstrap.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      logger.warn(`Dropped table ${table}`);
    }
  } finally {
    await bootstrap.destroy();
  }
}
