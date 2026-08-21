import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { RequestUser, UserContext } from "./user-context";

@Injectable()
export class UserContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = this.resolveUser(context);
    if (!user) return next.handle();

    return new Observable((subscriber) => {
      const subscription = UserContext.run(user, () =>
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        }),
      );
      return () => subscription.unsubscribe();
    });
  }

  private resolveUser(context: ExecutionContext): RequestUser | undefined {
    if (context.getType() !== "http") return undefined;
    return context.switchToHttp().getRequest<{ user?: RequestUser }>().user;
  }
}
