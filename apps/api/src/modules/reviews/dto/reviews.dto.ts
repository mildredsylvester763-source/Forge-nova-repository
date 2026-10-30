import { IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class RequestReviewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  customerRef: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  customerName: string;

  @IsIn(['email', 'sms', 'whatsapp'])
  channel: string;

  @IsString()
  @MinLength(12)
  @MaxLength(500)
  reviewLink: string;
}

export class DraftReviewResponseDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reviewText: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  customerName: string;

  @IsIn(['professional', 'warm', 'apologetic'])
  tone: string;
}
