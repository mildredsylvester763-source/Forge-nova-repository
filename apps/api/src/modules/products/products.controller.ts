// ============================================================================
// FILE: /apps/api/src/modules/products/products.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request
// context only — never from the body.

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductStatus } from './enums';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateProductDto) {
    return this.productsService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: any, @Query() query: ProductQueryDto) {
    return this.productsService.findAll(req.user.id, query);
  }

  @Get('portfolio')
  getPortfolioMetrics(@Request() req: any) {
    return this.productsService.getPortfolioMetrics(req.user.id);
  }

  @Post('bulk-update')
  bulkUpdate(@Request() req: any, @Body() body: { ids: string[]; updates: UpdateProductDto }) {
    return this.productsService.bulkUpdate(req.user.id, body.ids, body.updates);
  }

  @Post('bulk-delete')
  bulkDelete(@Request() req: any, @Body() body: { ids: string[] }) {
    return this.productsService.bulkDelete(req.user.id, body.ids);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(req.user.id, id);
  }

  @Get(':id/history')
  getHistory(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Query('page') page = 1, @Query('limit') limit = 20) {
    retur
n this.productsService.getHistory(req.user.id, id, page, limit);
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(req.user.id, id, dto);
  }

  @Patch(':id/status')
  changeStatus(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: ProductStatus; reason?: string },
  ) {
    return this.productsService.changeStatus(req.user.id, id, body.status, body.reason);
  }

  @Post(':id/sale')
  recordSale(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: { amount: number }) {
    return this.productsService.recordSale(req.user.id, id, body.amount);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(req.user.id, id);
  }

  @Post(':id/restore')
  restore(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.restore(req.user.id, id);
  }
}
