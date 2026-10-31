import { Body, Controller, Delete, Get, Param, Post, Request } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto, CreateSupplierDto, ReceivePoLineDto } from './dto/purchasing.dto';

@Controller('purchasing')
export class PurchasingController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  @Post('suppliers')
  async createSupplier(@Request() req: any, @Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(req.user.id, dto);
  }

  @Get('suppliers')
  async listSuppliers(@Request() req: any) {
    return this.suppliersService.list(req.user.id);
  }

  @Delete('suppliers/:id')
  async archiveSupplier(@Request() req: any, @Param('id') id: string) {
    await this.suppliersService.archive(req.user.id, id);
    return { archived: true };
  }

  @Post('purchase-orders')
  async createDraft(@Request() req: any, @Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrdersService.createDraft(req.user.id, dto);
  }

  @Get('purchase-orders')
  async listOrders(@Request() req: any) {
    return this.purchaseOrdersService.list(req.user.id);
  }

  @Get('purchase-orders/:id/lines')
  async listLines(@Request() req: any, @Param('id') id: string) {
    return this.purchaseOrdersService.listLines(req.user.id, id);
  }

  @Post('purchase-orders/:id/send')
  async send(@Request() req: any, @Param('id') id: string) {
    return this.purchaseOrdersService.send(req.user.id, id);
  }

  @Post('purchase-orders/:id/cancel')
  async cancel(@Request() req: any, @Param('id') id: string) {
    return this.purchaseOrdersService.cancel(req.user.id, id);
  }

  @Post('purchase-orders/:id/receive')
  async receive(@Request() req: any, @Param('id') id: string, @Body() dto: ReceivePoLineDto) {
    return this.purchaseOrdersService.receive(req.user.id, id, dto);
  }
}
