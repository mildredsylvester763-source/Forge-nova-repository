import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { AssignBarcodeDto, CreateCatalogItemDto } from './dto/catalog.dto';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('items')
  async createItem(@Request() req: any, @Body() dto: CreateCatalogItemDto) {
    return this.catalogService.createCatalogItem(req.user.id, dto);
  }

  @Get('items')
  async listItems(@Request() req: any) {
    return this.catalogService.listItems(req.user.id);
  }

  @Get('items/:id/variants')
  async listVariants(@Request() req: any, @Param('id') id: string) {
    return this.catalogService.variantsFor(req.user.id, id);
  }

  @Post('variants/:id/barcode')
  async assignBarcode(@Request() req: any, @Param('id') id: string, @Body() dto: AssignBarcodeDto) {
    return this.catalogService.assignBarcode(req.user.id, id, dto);
  }

  @Get('scan/:barcode')
  async scan(@Request() req: any, @Param('barcode') barcode: string) {
    return this.catalogService.scan(req.user.id, barcode);
  }
}
