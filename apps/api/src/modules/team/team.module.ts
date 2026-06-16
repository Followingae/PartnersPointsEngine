import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

/** Brand team & access management (W4) — invite, role, revoke over RBAC. */
@Module({
  imports: [AuthModule],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
