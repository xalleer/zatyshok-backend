import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UnitService } from './unit.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import {
  UnitResponseDto,
  UnitWithAvailabilityDto,
} from './dto/unit-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UnitOwnerGuard } from './guards/unit-owner.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '../../prisma/generated/enums';

@ApiTags('units')
@Controller()
export class UnitController {
  constructor(private readonly unitService: UnitService) {}

  // ─── Public ───────────────────────────────────────────────────────────────

  /**
   * GET /properties/:propertyId/units
   * Публічний список юнітів з діапазонами зайнятих дат.
   * Фронт використовує для рендерингу сторінки об'єкта з календарем.
   */
  @Get('properties/:propertyId/units')
  @Public()
  @ApiOperation({
    summary: "Список юнітів з доступністю (для публічної сторінки об'єкта)",
  })
  @ApiParam({ name: 'propertyId' })
  @ApiResponse({ status: 200, type: [UnitWithAvailabilityDto] })
  findByProperty(
    @Param('propertyId') propertyId: string,
  ): Promise<UnitWithAvailabilityDto[]> {
    return this.unitService.findByProperty(propertyId);
  }

  /**
   * GET /units/:id
   * Один юніт з доступністю — для вибору дат бронювання.
   */
  @Get('units/:id')
  @Public()
  @ApiOperation({ summary: 'Юніт з доступністю за ID' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: UnitWithAvailabilityDto })
  findOne(@Param('id') id: string): Promise<UnitWithAvailabilityDto> {
    return this.unitService.findOne(id);
  }

  // ─── HOST: управління юнітами ─────────────────────────────────────────────

  /**
   * POST /properties/:propertyId/units
   * Створення юніта всередині Property.
   * Власник може додавати скільки завгодно альтанок/будиночків.
   */
  @Post('properties/:propertyId/units')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Додати юніт до об'єкта (тільки HOST-власник)" })
  @ApiParam({ name: 'propertyId' })
  @ApiResponse({ status: 201, type: UnitResponseDto })
  create(
    @Param('propertyId') propertyId: string,
    @CurrentUser('id') hostId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreateUnitDto,
  ): Promise<UnitResponseDto> {
    if (role !== Role.HOST && role !== Role.ADMIN) {
      throw new ForbiddenException('Додавання юнітів доступно лише для HOST');
    }
    return this.unitService.create(propertyId, hostId, dto);
  }

  /**
   * PATCH /units/:id
   * Оновлення юніта. UnitOwnerGuard перевіряє власника через Property.
   */
  @Patch('units/:id')
  @UseGuards(JwtAuthGuard, UnitOwnerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Оновити юніт (назва, ціна, місткість, зручності)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: UnitResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
  ): Promise<UnitResponseDto> {
    return this.unitService.update(id, dto);
  }

  /**
   * DELETE /units/:id
   * Видалення юніта. Захищено: не можна видалити якщо є активні броні.
   */
  @Delete('units/:id')
  @UseGuards(JwtAuthGuard, UnitOwnerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Видалити юніт (заборонено якщо є активні бронювання)',
  })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string): Promise<{ message: string }> {
    return this.unitService.remove(id);
  }
}
