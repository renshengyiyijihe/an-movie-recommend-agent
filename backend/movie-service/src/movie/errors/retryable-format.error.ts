/**
 * 模型输出格式错误，允许业务层再试。网络 / 超时不要用这个。
 */
export class RetryableFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableFormatError";
  }
}
