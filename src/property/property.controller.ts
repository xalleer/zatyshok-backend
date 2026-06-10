import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { PropertyService } from './property.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyResponseDto } from './dto/property-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PropertyOwnerGuard } from './guards/property-owner.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '../../prisma/generated/enums';
import {
  PaginationDto,
  PaginatedResponseDto,
} from '../common/dto/pagination.dto';

@ApiTags('properties')
@Controller('properties')
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  // ─── Public ───────────────────────────────────────────────────────────────

  @Get()
  @Public()
  @ApiOperation({ summary: "Список усіх активних об'єктів (маркетплейс)" })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated list of properties' })
  findAll(
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<PropertyResponseDto>> {
    return this.propertyService.findAll(pagination);
  }

  @Get('slug/:slug')
  @Public()
  @ApiOperation({ summary: "Публічна сторінка об'єкта за slug (міні-сайт)" })
  @ApiParam({ name: 'slug', example: 'lisova-pisnya' })
  @ApiResponse({ status: 200, type: PropertyResponseDto })
  @ApiResponse({ status: 404, description: "Об'єкт не знайдено" })
  findBySlug(@Param('slug') slug: string): Promise<PropertyResponseDto> {
    return this.propertyService.findBySlug(slug);
  }

  // ─── HOST: власні об'єкти ─────────────────────────────────────────────────

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Всі об'єкти поточного HOST-а (для дашборду)" })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of host properties',
  })
  findMyProperties(
    @CurrentUser('id') hostId: string,
    @CurrentUser('role') role: string,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<PropertyResponseDto>> {
    if (role !== Role.HOST && role !== Role.ADMIN) {
      throw new ForbiddenException('Доступно лише для власників баз');
    }
    return this.propertyService.findByHost(hostId, pagination);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Створити новий об'єкт (тільки HOST)" })
  @ApiResponse({ status: 201, type: PropertyResponseDto })
  @ApiResponse({ status: 409, description: 'Slug вже зайнятий' })
  create(
    @CurrentUser('id') hostId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreatePropertyDto,
  ): Promise<PropertyResponseDto> {
    if (role !== Role.HOST && role !== Role.ADMIN) {
      throw new ForbiddenException(
        "Реєстрація об'єктів доступна лише для HOST",
      );
    }
    return this.propertyService.create(hostId, dto);
  }

  // ─── HOST/ADMIN: управління конкретним об'єктом ───────────────────────────

  @Get(':id')
  @UseGuards(JwtAuthGuard, PropertyOwnerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Отримати об'єкт за ID (для власника або адміна)" })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: PropertyResponseDto })
  findOne(@Param('id') id: string): Promise<PropertyResponseDto> {
    return this.propertyService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PropertyOwnerGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Оновити об'єкт (назва, опис, адреса, фото, політика)",
  })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: PropertyResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePropertyDto,
  ): Promise<PropertyResponseDto> {
    return this.propertyService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PropertyOwnerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Видалити об'єкт (каскадно видаляються Units і Bookings)",
  })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string): Promise<{ message: string }> {
    return this.propertyService.remove(id);
  }
}
