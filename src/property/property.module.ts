import { Module } from '@nestjs/common';
import { PropertyController } from './property.controller';
import { PropertyService } from './property.service';
import { PropertyOwnerGuard } from './guards/property-owner.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PropertyController],
  providers: [PropertyService, PropertyOwnerGuard],
  exports: [PropertyService],
})
export class PropertyModule {}
