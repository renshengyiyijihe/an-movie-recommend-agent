/**
 * 同一会话已有 running 轮次时拒绝再开一轮。
 * gRPC 映射为 FAILED_PRECONDITION；不要改成 404，避免和「会话不存在」混在一起。
 */
export class TurnInProgressError extends Error {
  constructor() {
    super("上一轮还在处理，请稍后再发");
    this.name = TurnInProgressError.name;
  }
}
