import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { BatchesService } from './batches.service';
import {
  CreateLocationDto,
  DisposeBatchDto,
  PickBatchDto,
  ReceiveBatchDto,
  ReceiveStockDto,
  TransferStockDto,
} from './dto/warehousing.dto';

@Controller('warehousing')
export class WarehousingController {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly batchesService: BatchesService,
  ) {}

  @Post('locations')
  async createLocation(@Request() req: any, @Body() dto: CreateLocationDto) {
    return this.locationsService.createLocation(req.user.id, dto);
  }

  @Get('locations')
  async listLocations(@Request() req: any) {
    return this.locationsService.listLocations(req.user.id);
  }

  @Post('locations/stock')
  async receiveStock(@Request() req: any, @Body() dto: ReceiveStockDto) {
    return this.locationsService.receiveStock(req.user.id, dto);
  }

  @Post('locations/transfer')
  async transferStock(@Request() req: any, @Body() dto: TransferStockDto) {
    return this.locationsService.transferStock(req.user.id, dto);
  }

  @Get('locations/:id/stock')
  async locationStock(@Request() req: any, @Param('id') id: string) {
    return this.locationsService.locationStock(req.user.id, id);
  }

  @Get('stock/:sku')
  async skuTotals(@Request() req: any, @Param('sku') sku: string) {
    return this.locationsService.skuTotals(req.user.id, sku);
  }

  @Post('batches')
  async receiveBatch(@Request() req: any, @Body() dto: ReceiveBatchDto) {
    return this.batchesService.receiveBatch(req.user.id, dto);
  }

  @Get('batches')
  async listBatches(@Request() req: any, @Query('sku') sku?: string) {
    return this.batchesService.listBatches(req.user.id, sku);
  }

  @Post('batches/pick')
  async pickBatch(@Request() req: any, @Body() dto: PickBatchDto) {
    return this.batchesService.pickBatch(req.user.id, dto);
  }

  @Post('batches/dispose-expired')
  async disposeExpired(@Request() req: any, @Body() dto: DisposeBatchDto) {
    return this.batchesService.disposeExpired(req.user.id, dto);
  }

  @Get('batches/expiring')
  async expiring(@Request() req: any, @Query('withinDays') withinDays: string, @Query('sku') sku?: string) {
    return this.batchesService.expiringSoon(req.user.id, Number(withinDays), sku);
  }
}
