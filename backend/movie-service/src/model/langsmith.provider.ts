import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'langsmith';

@Injectable()
export class LangSmithProvider {
  private client: Client | null = null;
  private readonly logger = new Logger(LangSmithProvider.name);

  getClient() {
    if (this.client) {
      return this.client;
    }

    const apiKey = process.env.LANGSMITH_API_KEY;
    if (!apiKey) {
      this.logger.warn('LangSmith API key not configured. LangSmith disabled.');
      return null;
    }

    this.logger.log('Initializing LangSmith client');
    this.client = new Client({
      apiKey,
      apiUrl: process.env.LANGSMITH_API_URL || process.env.LANGSMITH_BASE_URL,
      workspaceId: process.env.LANGSMITH_WORKSPACE_ID,
      debug: process.env.LANGSMITH_DEBUG === 'true',
    });

    this.logger.log('LangSmith client initialized successfully');
    return this.client;
  }

  isEnabled() {
    return !!this.getClient();
  }

  async createRun(
    name: string,
    input: Record<string, unknown>,
    output?: Record<string, unknown>,
    extra?: Record<string, unknown>,
    runType: string = 'tool',
  ) {
    const client = this.getClient();
    if (!client) {
      this.logger.warn('LangSmith client not configured; skipping run creation');
      return null;
    }

    try {
      const normalizedOutput = {
        ...(output ?? {}),
        usage: this.normalizeUsage((output as Record<string, unknown> | undefined)?.usage),
      };

      const normalizedExtra = {
        ...(extra ?? {}),
        usage: this.normalizeUsage((extra as Record<string, unknown> | undefined)?.usage),
      };

      await client.createRun({
        name,
        inputs: input,
        outputs: normalizedOutput,
        run_type: runType,
        extra: normalizedExtra,
      });

      this.logger.log(`LangSmith run created: ${name} (type=${runType})`);
      return true;
    } catch (error) {
      this.logger.warn(`LangSmith run creation failed for ${name}: ${(error as Error).message}`);
      return false;
    }
  }

  private normalizeUsage(usage: unknown): Record<string, unknown> | undefined {
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
      return undefined;
    }

    const usageRecord = usage as Record<string, unknown>;
    return {
      prompt_tokens: Number(usageRecord.prompt_tokens ?? usageRecord.input_tokens ?? 0),
      completion_tokens: Number(usageRecord.completion_tokens ?? usageRecord.output_tokens ?? 0),
      total_tokens: Number(usageRecord.total_tokens ?? 0),
      prompt_tokens_details: usageRecord.prompt_tokens_details ?? null,
    };
  }
}
