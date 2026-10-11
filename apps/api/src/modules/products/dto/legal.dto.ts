// ============================================================================
// FILE: apps/api/src/modules/products/dto/legal.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, IsBoolean, IsUrl, IsDateString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TermsDto { @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsString() version?:string; @IsOptional() @IsDateString() lastUpdated?:string; @IsOptional() @IsBoolean() accepted?:boolean; }

export class PrivacyPolicyDto { @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsString() version?:string; @IsOptional() @IsDateString() lastUpdated?:string; }

export class RefundPolicyDto { @IsOptional() @IsString() type?:'no-refunds'|'full-refund'|'partial-refund'|'store-credit'; @IsOptional() @IsNumber() days?:number; @IsOptional() @IsArray() @IsString({each:true}) conditions?:string[]; @IsOptional() @IsString() content?:string; }

export class LicenseDto { @IsString() id:string; @IsString() type:'commercial'|'personal'|'educational'|'open-source'; @IsOptional() @IsString() name?:string; @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsNumber() price?:number; }

export class AgeRestrictionsDto { @IsBoolean() enabled:boolean; @IsOptional() @IsNumber() minAge?:number; @IsOptional() @IsBoolean() verificationRequired?:boolean; }

export class RegionalComplianceDto { @IsString() region:string; @IsBoolean() compliant:boolean; @IsOptional() @IsArray() @IsString({each:true}) requirements?:string[]; }

export class IpDto { @IsOptional() @IsBoolean() registered?:boolean; @IsOptional() @IsString() owner?:string; @IsOptional() @IsString() license?:string; }

export class CopyrightDto { @IsOptional() @IsString() holder?:string; @IsOptional() @IsDateString() year?:string; @IsOptional() @IsString() registration?:string; }

export class TrademarkDto { @IsOptional() @IsString() name?:string; @IsOptional() @IsString() registration?:string; @IsOptional() @IsString() jurisdiction?:string; }

export class PatentDto { @IsOptional() @IsString() number?:string; @IsOptional() @IsString() title?:string; @IsOptional() @IsString() jurisdiction?:string; }

export class RegulatoryDto { @IsString() complianceLevel:'none'|'low'|'medium'|'high'; @IsOptional() @IsNumber() cost?:number; @IsOptional() @IsNumber() time?:number; @IsOptional() @IsString() status?:'pending'|'compliant'|'non-compliant'|'exempt'; @IsOptional() @IsArray() @IsString({each:true}) documentation?:string[]; }

export class ComplianceDto { @IsOptional() @IsBoolean() gdpr?:boolean; @IsOptional() @IsBoolean() ccpa?:boolean; @IsOptional() @IsBoolean() hipaa?:boolean; @IsOptional() @IsBoolean() pciDss?:boolean; @IsOptional() @ValidateNested() @Type(() => AgeRestrictionsDto) ageRestrictions?:AgeRestrictionsDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => RegionalComplianceDto) regional?:RegionalComplianceDto[]; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => RegulatoryDto) regulatory?:RegulatoryDto[]; }

export class LegalDto { @IsOptional() @ValidateNested() @Type(() => TermsDto) termsAndConditions?:TermsDto; @IsOptional() @ValidateNested() @Type(() => PrivacyPolicyDto) privacyPolicy?:PrivacyPolicyDto; @IsOptional() @ValidateNested() @Type(() => RefundPolicyDto) refundPolicy?:RefundPolicyDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => LicenseDto) licenses?:LicenseDto[]; @IsOptional() @ValidateNested() @Type(() => ComplianceDto) compliance?:ComplianceDto; @IsOptional() @ValidateNested() @Type(() => IpDto) ip?:IpDto; @IsOptional() @ValidateNested() @Type(() => CopyrightDto) copyright?:CopyrightDto; @IsOptional() @ValidateNested() @Type(() => TrademarkDto) trademark?:TrademarkDto; @IsOptional() @ValidateNested() @Type(() => PatentDto) patent?:PatentDto; }
