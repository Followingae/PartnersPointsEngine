import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type ErrorCode, makeError } from '@rfm-loyalty/shared';

function mapStatusToCode(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'validation_error';
    case HttpStatus.UNAUTHORIZED:
      return 'unauthorized';
    case HttpStatus.FORBIDDEN:
      return 'forbidden';
    case HttpStatus.NOT_FOUND:
      return 'not_found';
    case HttpStatus.CONFLICT:
      return 'conflict';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'rate_limited';
    default:
      return 'internal_error';
  }
}

type NamedError = Error & { name: string; code?: string };

function isDomainError(e: unknown): e is NamedError {
  if (!(e instanceof Error)) return false;
  const name = (e as NamedError).name;
  const code = (e as NamedError).code;
  return (
    name === 'LedgerError' ||
    name === 'ZodError' ||
    (typeof code === 'string' && /^P\d{4}$/.test(code)) // Prisma known request error
  );
}

/** Map ledger/zod/Prisma errors to a sane status + envelope code. */
function mapDomainError(e: NamedError): { status: number; code: ErrorCode; message: string } {
  if (e.name === 'ZodError') {
    return { status: HttpStatus.BAD_REQUEST, code: 'validation_error', message: 'invalid request' };
  }
  if (e.name === 'LedgerError') {
    switch (e.code) {
      case 'insufficient_balance':
        return { status: HttpStatus.BAD_REQUEST, code: 'validation_error', message: 'insufficient balance' };
      case 'idempotency_conflict':
        return { status: HttpStatus.CONFLICT, code: 'conflict', message: 'idempotency key reused with a different request' };
      case 'hold_not_releasable':
        return { status: HttpStatus.CONFLICT, code: 'conflict', message: 'the hold is no longer releasable' };
      case 'invalid_amount':
        return { status: HttpStatus.BAD_REQUEST, code: 'validation_error', message: 'invalid amount' };
      default:
        return { status: HttpStatus.CONFLICT, code: 'conflict', message: 'ledger conflict' };
    }
  }
  // Prisma known request errors.
  switch (e.code) {
    case 'P2002':
      return { status: HttpStatus.CONFLICT, code: 'conflict', message: 'resource already exists' };
    case 'P2025':
      return { status: HttpStatus.NOT_FOUND, code: 'not_found', message: 'resource not found' };
    case 'P2028':
      return { status: HttpStatus.SERVICE_UNAVAILABLE, code: 'internal_error', message: 'service busy, retry' };
    default:
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'internal_error', message: 'Internal server error' };
  }
}

/** Renders every error as the single shared error envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request & { id?: string }>();
    const requestId = req.id;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'internal_error';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = mapStatusToCode(status);
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (response && typeof response === 'object') {
        const body = response as Record<string, unknown>;
        message = (body.message as string) ?? exception.message;
        details = body.details ?? (Array.isArray(body.message) ? body.message : undefined);
      }
    } else if (isDomainError(exception)) {
      // Known non-HTTP errors that were previously all surfaced as 500s:
      // ledger invariants, zod parse failures, and Prisma unique/not-found.
      ({ status, code, message } = mapDomainError(exception));
      if (status >= 500) this.logger.error((exception as Error).stack ?? message);
    } else if (exception instanceof Error) {
      message = process.env.NODE_ENV === 'production' ? 'Internal server error' : exception.message;
      this.logger.error(exception.stack ?? exception.message);
    }

    res.status(status).json(makeError(code, message, details, requestId));
  }
}
