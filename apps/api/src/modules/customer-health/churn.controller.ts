import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { ChurnService } from './churn.service';
import { AssessChurnDto } from './dto/customer-health.dto';

@Controller('churn')
export class ChurnController {
  constructor(private readonly churn: ChurnService) {}

  @Post('assessments')
  async assess(@Request() req: any, @Body() dto: AssessChurnDto) {
    return this.churn.assess(req.user.id, dto.customerRef, {
      daysSinceLastInteraction: dto.daysSinceLastInteraction,
      overdueInvoiceCount: dto.overdueInvoiceCount,
      maxDaysOverdue: dto.maxDaysOverdue,
      spendTrendPercent: dto.spendTrendPercent,
    });
  }

  @Get('assessments')
  async listAssessments(@Request() req: any) {
    return this.churn.listAssessments(req.user.id);
  }
}
