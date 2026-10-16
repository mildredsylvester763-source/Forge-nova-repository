// ============================================================================
// FILE: /apps/api/src/modules/inventory/inventory.controller.ts
// ============================================================================
// Zero-trust entry points: userId comes from the request, never the body.
// Static routes are declared before any ':id' route.

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Request } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateStockItemDto, StockMovementDto } from './dto/inventory.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('items')
  createItem(@Request() req: any, @Body() dto: CreateStockItemDto) {
    return this.inventoryService.createItem(req.user.id, dto);
  }

  @Get('items')
  listItems(@Request() req: any) {
    return this.inventoryService.listItems(req.user.id);
  }

  @Get('items/:id/movements')
  movements(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.movements(req.user.id, id);
  }

  @Get('items/:id/reorder-plan')
  reorderPlan(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.reorderPlanFor(req.user.id, id);
  }

  @Post('items/:id/movements')
  move(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockMovementDto,
  ) {
    return this.inventoryService.move(req.user.id, id, dto);
  }
}
