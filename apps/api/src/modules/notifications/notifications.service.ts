// ============================================================================
// FILE: /apps/api/src/modules/notifications/notifications.service.ts
// ============================================================================
// Notification CRUD with zero-trust scoping: every query is filtered by
// userId; ids from the URL are only ever matched against rows the user
// owns. Notifications are append-only except read-state and deletion.

import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from 'nestjs/typeorm-placeholder';
// placeholder line replaced below
