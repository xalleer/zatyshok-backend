import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import {
  BookingAccessGuard,
  BookingHostGuard,
} from './guards/booking-access.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { UnitModule } from '../unit/unit.module';

@Module({
  imports: [
    PrismaModule,
    UnitModule, // для checkAvailability()
    ScheduleModule.forRoot(), // для @Cron
  ],
  controllers: [BookingController],
  providers: [BookingService, BookingAccessGuard, BookingHostGuard],
  exports: [BookingService],
})
export class BookingModule {}
