import {
  Controller,
  Get,
  Post,
  Patch,
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
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ConfirmBookingDto } from './dto/confirm-booking.dto';
import { BookingResponseDto } from './dto/booking-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingAccessGuard, BookingHostGuard } from './guards/booking-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('bookings')
@Controller('bookings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ─── CLIENT: створення броні ──────────────────────────────────────────────

  /**
   * POST /bookings
   * Клієнт обирає дати → система створює HOLD на 15 хв.
   * Дати заблоковані для інших користувачів поки клієнт заповнює форму.
   */
  @Post()
  @ApiOperation({
    summary: 'Забронювати юніт (HOLD на 15 хв)',
    description: 'Створює бронювання зі статусом HOLD. Дати блокуються на 15 хвилин для інших клієнтів.',
  })
  @ApiResponse({ status: 201, type: BookingResponseDto })
  @ApiResponse({ status: 409, description: 'Дати вже зайняті' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    return this.bookingService.create(userId, dto);
  }

  // ─── HOST: ручне блокування дат ──────────────────────────────────────────

  /**
   * POST /bookings/block
   * HOST блокує дати вручну (телефонне бронювання, особисті плани тощо).
   * Одразу CONFIRMED, без HOLD.
   */
  @Post('block')
  @ApiOperation({
    summary: 'Заблокувати дати вручну (HOST)',
    description: 'Власник блокує дати без участі клієнта. Статус одразу CONFIRMED.',
  })
  @ApiResponse({ status: 201, type: BookingResponseDto })
  block(
    @CurrentUser('id') hostId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    if (role !== 'HOST' && role !== 'ADMIN') {
      throw new ForbiddenException('Тільки HOST може блокувати дати');
    }
    return this.bookingService.blockDates(hostId, dto);
  }

  // ─── READ ─────────────────────────────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: 'Мої бронювання (CLIENT)' })
  @ApiResponse({ status: 200, type: [BookingResponseDto] })
  findMy(@CurrentUser('id') userId: string): Promise<BookingResponseDto[]> {
    return this.bookingService.findByUser(userId);
  }

  @Get('property/:propertyId')
  @ApiOperation({ summary: 'Всі бронювання об\'єкта (HOST-дашборд)' })
  @ApiParam({ name: 'propertyId' })
  @ApiResponse({ status: 200, type: [BookingResponseDto] })
  findByProperty(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('propertyId') propertyId: string,
  ): Promise<BookingResponseDto[]> {
    // Додаткова перевірка ролі (детальна перевірка — в сервісі)
    if (role !== 'HOST' && role !== 'ADMIN') {
      throw new ForbiddenException('Тільки HOST може переглядати бронювання об\'єкта');
    }
    return this.bookingService.findByProperty(propertyId);
  }

  @Get(':id')
  @UseGuards(BookingAccessGuard)
  @ApiOperation({ summary: 'Деталі бронювання (клієнт або HOST об\'єкта)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  findOne(@Param('id') id: string): Promise<BookingResponseDto> {
    return this.bookingService.findById(id);
  }

  // ─── ACTIONS ──────────────────────────────────────────────────────────────

  /**
   * PATCH /bookings/:id/confirm
   * HOST підтверджує бронювання. Статус: HOLD/PENDING → CONFIRMED.
   */
  @Patch(':id/confirm')
  @UseGuards(BookingHostGuard)
  @ApiOperation({ summary: 'Підтвердити бронювання (HOST)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmBookingDto,
  ): Promise<BookingResponseDto> {
    return this.bookingService.confirm(id, dto);
  }

  /**
   * PATCH /bookings/:id/cancel
   * Скасування клієнтом. Повернення визначається CancellationPolicy.
   */
  @Patch(':id/cancel')
  @UseGuards(BookingAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Скасувати бронювання',
    description: 'Клієнт або HOST скасовують бронювання. Повернення передоплати визначається CancellationPolicy об\'єкта.',
  })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  cancel(
    @Param('id') id: string,
    @CurrentUser('role') role: string,
  ): Promise<BookingResponseDto> {
    const cancelledBy = role === 'ADMIN' ? 'ADMIN' : role === 'HOST' ? 'HOST' : 'CLIENT';
    return this.bookingService.cancel(id, cancelledBy as 'CLIENT' | 'HOST' | 'ADMIN');
  }

  /**
   * PATCH /bookings/:id/complete
   * HOST позначає що клієнт виїхав → статус COMPLETED.
   * Після цього клієнт може залишити відгук.
   */
  @Patch(':id/complete')
  @UseGuards(BookingHostGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Позначити як завершене (HOST)',
    description: 'Статус CONFIRMED → COMPLETED. Відкриває можливість для відгуку.',
  })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  complete(@Param('id') id: string): Promise<BookingResponseDto> {
    return this.bookingService.complete(id);
  }
}
