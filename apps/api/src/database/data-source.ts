// ============================================================================
// FILE: /apps/api/src/database/data-source.ts
// ============================================================================
// TypeORM migration source. Schema changes ship as versioned migration
// files — NEVER auto-sync in production.
//   npm run migration:generate -- -n <Name>
//   npm run migration:run
//   npm run migration:revert

import 'reflect-metadata';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  logging: false,
  synchronize: false,
});
