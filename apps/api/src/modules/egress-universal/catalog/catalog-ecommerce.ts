// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/catalog/catalog-ecommerce.ts
// ============================================================================
// E-commerce platforms, marketplaces, POS, shipping and logistics, reviews
// and loyalty destinations.
import { DestinationDefinition, D } from './destination-types';

export const ECOMMERCE: DestinationDefinition[] = [
  // Store platforms.
  D('shopify', 'Shopify', 'ecommerce', 'https://{store}.myshopify.com', 'api-key-header', ['store', 'accessToken'], '/admin/api/2026-01/shop.json', 'X-Shopify-Access-Token'),
  D('woocommerce', 'WooCommerce', 'ecommerce', 'https://{store}', 'basic', ['store', 'consumerKey', 'consumerSecret'], '/wp-json/wc/v3/system_status'),
  D('bigcommerce', 'BigCommerce', 'ecommerce', 'https://api.bigcommerce.com', 'api-key-header', ['accessToken'], '/v3/health', 'X-Auth-Token', ['store']),
  D('magento', 'Adobe Commerce (Magento)', 'ecommerce', 'https://{store}', 'bearer', ['accessToken'], '/rest/V1/store/storeConfigs', undefined, ['store']),
  D('wix-ecommerce', 'Wix eCommerce', 'ecommerce', 'https://www.wixapis.com', 'bearer', ['accessToken'], '/stores/v2/health'),
  D('squarespace-commerce', 'Squarespace Commerce', 'ecommerce', 'https://api.squarespace.com', 'bearer', ['apiKey'], '/1.0/authorization/health'),
  D('prestashop', 'PrestaShop', 'ecommerce', 'https://{store}', 'api-key-header', ['apiKey'], '/api/health', 'Authorization', ['store']),
  D('ecwid', 'Ecwid', 'ecommerce', 'https://app.ecwid.com', 'bearer', ['accessToken'], '/api/v3/health', undefined, ['store']),
  D('shift4shop', 'Shift4Shop', 'ecommerce', 'https://api.3dcart.com', 'api-key-header', ['apiKey'], '/v1/health', 'SecureURL', ['store']),
  D('volusion', 'Volusion', 'ecommerce', 'https://{store}', 'api-key-header', ['apiKey'], '/api/health', 'Authorization', ['store']),
  D('bigcartel', 'Big Cartel', 'ecommerce', 'https://api.bigcartel.com', 'bearer', ['accessToken'], '/v1/health'),
  D('webflow-commerce', 'Webflow Ecommerce', 'ecommerce', 'https://api.webflow.com', 'bearer', ['accessToken'], '/v2/health', undefined, ['refreshToken']),

  // Marketplaces.
  D('etsy', 'Etsy', 'marketplace', 'https://openapi.etsy.com', 'oauth-code', ['accessToken'], '/v3/application/health', undefined, ['refreshToken']),
  D('ebay', 'eBay', 'marketplace', 'https://api.ebay.com', 'oauth-code', ['accessToken'], '/v1/oauth2/health', undefined, ['refreshToken']),
  D('amazon-selling-partner', 'Amazon Selling Partner', 'marketplace', 'https://sellingpartnerapi-eu.amazon.com', 'bearer', ['accessToken'], '/v1/health', undefined, ['refreshToken']),
  D('walmart-marketplace', 'Walmart Marketplace', 'marketplace', 'https://marketplace.walmartapis.com', 'api-key-header', ['clientId', 'clientSecret'], '/v3/health', 'WM_CONSUMER.ID'),
  D('tiktok-shop', 'TikTok Shop', 'marketplace', 'https://open.tiktokapis.com', 'bearer', ['accessToken'], '/v1/health', undefined, ['refreshToken']),
  D('mercado-libre', 'Mercado Libre', 'marketplace', 'https://api.mercadolibre.com', 'oauth-code', ['accessToken'], '/users/me', undefined, ['refreshToken']),
  D('allegro', 'Allegro', 'marketplace', 'https://api.allegro.pl', 'bearer', ['accessToken'], '/health', undefined, ['refreshToken']),
  D('fnac', 'Fnac Marketplace', 'marketplace', 'https://marketplace.ws.fd-1gfnac.com', 'bearer', ['apiKey'], '/api/health'),
  D('stockx', 'StockX (via partners)', 'marketplace', 'https://api.stockx.com', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization'),
  D('clickbank', 'ClickBank', 'marketplace', 'https://api.clickbank.com', 'api-key-header', ['apiKey'], '/health', 'Authorization', ['secretKey']),

  // Point of sale.
  D('lightspeed', 'Lightspeed Retail', 'ecommerce', 'https://api.lightspeedapp.com', 'oauth-code', ['accessToken'], '/v1/health', undefined, ['refreshToken']),
  D('clover', 'Clover', 'ecommerce', 'https://api.clover.com', 'bearer', ['accessToken'], '/v3/merchants', undefined, ['refreshToken']),
  D('vend', 'Lightspeed Vend (X-Series)', 'ecommerce', 'https://{store}.vendecommerce.com', 'bearer', ['accessToken'], '/api/2.0/outlets', undefined, ['store']),
  D('square-pos', 'Square POS', 'ecommerce', 'https://squareup.com', 'bearer', ['accessToken'], '/v2/health'),

  // Print-on-demand and dropshipping.
  D('printful', 'Printful', 'marketplace', 'https://api.printful.com', 'bearer', ['apiKey'], '/oauth/token'),
  D('printify', 'Printify', 'marketplace', 'https://api.printify.com', 'bearer', ['accessToken'], '/v1/shops.json'),
  D('aliexpress-dropship', 'AliExpress (Open Platform)', 'marketplace', 'https://open.aliexpress.com', 'oauth-code', ['accessToken'], '/sync/api/health'),

  // Shipping and logistics.
  D('shippo', 'Shippo', 'shipping', 'https://api.goshippo.com', 'bearer', ['apiKey'], '/v1/health'),
  D('easypost', 'EasyPost', 'shipping', 'https://api.easypost.com', 'bearer', ['apiKey'], '/v2/addresses'),
  D('shipstation', 'ShipStation', 'shipping', 'https://ssapi.shipstation.com', 'basic', ['apiKey', 'password'], '/orders'),
  D('aftership', 'AfterShip', 'shipping', 'https://api.aftership.com', 'bearer', ['apiKey'], '/v4/couriers'),
  D('shipbob', 'ShipBob', 'shipping', 'https://api.shipbob.com', 'bearer', ['accessToken'], '/v1/health'),
  D('sendle', 'Sendle', 'shipping', 'https://api.sendle.com', 'basic', ['username', 'password'], '/api/health'),
  D('packlink', 'Packlink', 'shipping', 'https://api.packlink.com', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization'),
  D('trackingmore', 'TrackingMore', 'shipping', 'https://api.trackingmore.com', 'api-key-header', ['apiKey'], '/v1/health', 'Tracking-Api-Key'),
  D('sendbox', 'Sendbox (Nigeria)', 'shipping', 'https://api.sendbox.it', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization'),
  D('fedex', 'FedEx', 'shipping', 'https://apis.fedex.com', 'bearer', ['clientId', 'clientSecret'], '/rate/v1/health'),
  D('ups', 'UPS', 'shipping', 'https://onlinetools.ups.com', 'api-key-header', ['username', 'password'], '/api/health', 'transId', ['accessToken']),
  D('dhl', 'DHL Express', 'shipping', 'https://api.dhlecs.com', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization'),
  D('royal-mail', 'Royal Mail', 'shipping', 'https://api.royalmail.com', 'api-key-header', ['apiKey'], '/v1/health', 'X-IBM-Client-Id'),
  D('canada-post', 'Canada Post', 'shipping', 'https://ct.soa-gw.canadapost.ca', 'basic', ['username', 'password'], '/health'),
  D('australia-post', 'Australia Post', 'shipping', 'https://digitalapi.auspost.com.au', 'api-key-header', ['apiKey'], '/v1/health', 'AUTH-KEY'),
  D('gokada', 'Gokada Logistics', 'shipping', 'https://gokada.herokuapp.com', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization'),

  // Reviews, loyalty and referrals.
  D('trustpilot', 'Trustpilot', 'reviews', 'https://api.trustpilot.com', 'oauth-code', ['accessToken'], '/v1/health', undefined, ['refreshToken']),
  D('yotpo', 'Yotpo', 'reviews', 'https://api.yotpo.com', 'api-key-header', ['apiKey'], '/v1/health', 'X-Yotpo-Api-Key', ['secretKey']),
  D('okendo', 'Okendo', 'reviews', 'https://api.okendo.io', 'bearer', ['apiKey'], '/v1/health'),
  D('judge-me', 'Judge.me', 'reviews', 'https://judge.me', 'api-key-header', ['apiKey'], '/api/v1/health', 'Authorization'),
  D('reviews-io', 'Reviews.io', 'reviews', 'https://api.reviews.io', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization', ['store']),
  D('smileio', 'Smile.io', 'reviews', 'https://api.smile.io', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization', ['secretKey']),
  D('loyaltylion', 'LoyaltyLion', 'reviews', 'https://api.loyaltylion.net', 'basic', ['username', 'password'], '/v2/health'),
  D('refersion', 'Refersion', 'ads', 'https://api.refersion.com', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization'),
  D('everflow', 'Everflow', 'ads', 'https://api.eflow.io', 'api-key-header', ['apiKey'], '/v1/health', 'X-Eflow-API-Key'),
  D('firstpromoter', 'FirstPromoter', 'ads', 'https://firstpromoter.com', 'api-key-header', ['apiKey'], '/api/v1/health', 'x-api-key'),
  D('shareasale', 'ShareASale', 'ads', 'https://api.shareasale.com', 'bearer', ['apiKey'], '/v1/health', undefined, ['secretKey']),
  D('impact-platform', 'Impact.com', 'ads', 'https://api.impact.com', 'oauth-code', ['accountId', 'apiKey'], '/v1/health'),
  D('partnerstack', 'PartnerStack', 'ads', 'https://api.partnerstack.com', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization'),
  D('cj-affiliate', 'CJ Affiliate', 'ads', 'https://commission-detail.api.cj.com', 'bearer', ['accessToken'], '/v1/health'),
  D('rakuten-advertising', 'Rakuten Advertising', 'ads', 'https://api.rakutenmarketing.com', 'bearer', ['accessToken'], '/v1/health'),
  D('awin', 'AWIN', 'ads', 'https://api.awin.com', 'bearer', ['accessToken'], '/v1/health'),

  // Food and restaurant platforms.
  D('toast', 'Toast', 'ecommerce', 'https://ws-api.toasttab.com', 'bearer', ['accessToken'], '/v1/health'),
  D('ubereats-restaurant', 'Uber Eats (Restaurant)', 'marketplace', 'https://api.uber.com', 'bearer', ['accessToken'], '/v1/eats/health', undefined, ['refreshToken']),
  D('doordash-drive', 'DoorDash Drive', 'shipping', 'https://api.doordash.com', 'bearer', ['accessToken'], '/v1/health'),
];
