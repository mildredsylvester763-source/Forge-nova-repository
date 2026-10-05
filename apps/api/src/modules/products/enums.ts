// ============================================================================
// FILE: /apps/api/src/modules/products/enums.ts
// ============================================================================

export enum ProductType {
  EBOOK = 'ebook',
  TEMPLATE = 'template',
  COURSE = 'course',
  TOOL = 'tool',
  DATASET = 'dataset',
  PRINT_ON_DEMAND = 'print_on_demand',
  THREE_D_PRINT = 'three_d_print',
  CUSTOM_MANUFACTURED = 'custom_manufactured',
  SERVICE_PACKAGE = 'service_package',
  BUNDLE = 'bundle',
}

export enum ProductFormat {
  PDF = 'pdf',
  EPUB = 'epub',
  VIDEO = 'video',
  AUDIO = 'audio',
  INTERACTIVE = 'interactive',
  NOTION = 'notion',
  FIGMA = 'figma',
  CSV = 'csv',
  JSON = 'json',
  PHYSICAL = 'physical',
}

export enum ProductStatus {
  DRAFT = 'draft',
  VALIDATING = 'validating',
  PRE_LAUNCH = 'pre_launch',
  LIVE = 'live',
  PAUSED = 'paused',
  DISCONTINUED = 'discontinued',
  RETIRED = 'retired',
}
