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

  async createRun(name: string, input: Record<string, unknown>, output?: Record<string, unknown>, extra?: Record<string, unknown>) {
    const client = this.getClient();
    if (!client) {
      this.logger.warn('LangSmith client not configured; skipping run creation');
      return null;
    }

    await client.createRun({
      name,
      inputs: input,
      outputs: output,
      run_type: 'tool',
      extra,
    });

    this.logger.log(`LangSmith run created: ${name}`);
    return true;
  }
}
