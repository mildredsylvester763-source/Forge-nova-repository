// ============================================================================
// FILE: /apps/api/src/egress/egress.module.ts
// ============================================================================
// Wires the real HTTP adapters into the gateway at boot. A destination with
// no configured credentials simply has no adapter — calls to it fail fast
// with 'No transport adapter registered', which is the honest behavior:
// silent no-op scanning is never allowed.

import { Module, OnModuleInit } from '@nestjs/common';
import { EgressGatewayService } from './egress-gateway.service';
import { makeHttpAdapter, buildAdapterRegistry } from './adapters/http.adapters';
import { EgressDestination } from './egress.types';

@Module({
  providers: [EgressGatewayService],
  exports: [EgressGatewayService],
})
export class EgressModule implements OnModuleInit {
  constructor(private readonly gateway: EgressGatewayService) {}

  onModuleInit(): void {
    const registry = buildAdapterRegistry(process.env);

    const wiring: Array<[EgressDestination, string]> = [
      [EgressDestination.TWITTER, 'twitter'],
      [EgressDestination.REDDIT, 'reddit'],
      [EgressDestination.GOOGLE_SEARCH, 'google_search'],
      [EgressDestination.GOOGLE_TRENDS, 'google_trends'],
      [EgressDestination.GITHUB, 'github'],
    ];

    for (const [destination, key] of wiring) {
      const config = registry.get(key);
      if (config) {
        this.gateway.registerAdapter(destination, makeHttpAdapter(config));
      }
    }
  }
}
