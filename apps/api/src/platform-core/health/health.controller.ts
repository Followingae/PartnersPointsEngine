import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('system')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness — process is up. */
  @Get('health')
  health(): { status: string; ts: string } {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  /** Readiness — dependencies reachable. */
  @Get('ready')
  async ready(): Promise<{ status: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('database not reachable');
    }
  }

  /**
   * Lightweight process metrics. Production scrapes a Prometheus exporter
   * (prom-client) behind this; structured pino logs carry request/tenant traces.
   */
  @Get('metrics')
  metrics() {
    const mem = process.memoryUsage();
    return {
      uptimeSeconds: Math.round(process.uptime()),
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      node: process.version,
      pid: process.pid,
      ts: new Date().toISOString(),
    };
  }
}
