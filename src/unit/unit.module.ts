import { Module } from '@nestjs/common';
import { UnitController } from './unit.controller';
import { UnitService } from './unit.service';
import { UnitOwnerGuard } from './guards/unit-owner.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UnitController],
  providers: [UnitService, UnitOwnerGuard],
  // UnitService експортується — BookingModule використає checkAvailability
  exports: [UnitService],
})
export class UnitModule {}
