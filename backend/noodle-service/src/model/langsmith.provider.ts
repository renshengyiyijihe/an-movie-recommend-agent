import { Injectable } from '@nestjs/common';
import { Client } from 'langsmith';

@Injectable()
export class LangSmithProvider {
  private client: Client | null = null;

  getClient() {
    if (this.client) {
      return this.client;
    }

    const apiKey = process.env.LANGSMITH_API_KEY;
    if (!apiKey) {
      return null;
    }

    this.client = new Client({
      apiKey,
      apiUrl: process.env.LANGSMITH_API_URL || process.env.LANGSMITH_BASE_URL,
      workspaceId: process.env.LANGSMITH_WORKSPACE_ID,
      debug: process.env.LANGSMITH_DEBUG === 'true',
    });

    return this.client;
  }

  async createRun(name: string, input: Record<string, unknown>, output?: Record<string, unknown>, extra?: Record<string, unknown>) {
    const client = this.getClient();
    if (!client) {
      return null;
    }

    await client.createRun({
      name,
      inputs: input,
      outputs: output,
      run_type: 'tool',
      extra,
    });

    return true;
  }
}
