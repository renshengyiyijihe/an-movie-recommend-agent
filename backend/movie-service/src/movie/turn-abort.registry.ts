import { Injectable } from "@nestjs/common";

/**
 * 本进程正在跑的轮次 → AbortController。
 * `POST /movie/chat/cancel` 靠 turnId 找到它；断线不要 abort。
 */
@Injectable()
export class TurnAbortRegistry {
  private readonly controllers = new Map<string, AbortController>();

  register(turnId: string, controller: AbortController): void {
    this.controllers.set(turnId, controller);
  }

  abort(turnId: string): void {
    this.controllers.get(turnId)?.abort();
  }

  unregister(turnId: string): void {
    this.controllers.delete(turnId);
  }
}
