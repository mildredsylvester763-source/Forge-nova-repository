// ============================================================================
// FILE: /apps/api/src/modules/customer-statements/customer-statements.controller.ts
// ============================================================================

import { Controller, Get, Query, Request } from '@nestjs/common';
import { CustomerStatementsService } from './customer-statements.service';

@Controller('customer-statements')
export class CustomerStatementsController {
  constructor(private readonly statementsService: CustomerStatementsService) {}

  @Get()
  compose(@Request() req: any, @Query('customer') customer?: string) {
    return this.statementsService.composeFor(req.user.id, customer);
  }
}
