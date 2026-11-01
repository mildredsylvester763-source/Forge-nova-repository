// ============================================================================
// FILE: /apps/api/src/modules/email-campaigns/email-campaigns.functional.spec.ts
// ============================================================================
// Functional scenario tests: the REAL TemplatesService and CampaignsService
// wired to the shared in-memory repository helper. Multi-user reality: unique
// template and campaign names per owner, one-way publishing, merge variable
// rendering, named refusals with zero side effects, honest event recording,
// exact industry metric formulas computed from recorded events only, and
// per-owner isolation everywhere. No fake sends anywhere.

import { CampaignsService } from './campaigns.service';
import { TemplatesService } from './templates.service';
import { Campaign } from './entities/campaign.entity';
import { CampaignEvent } from './entities/campaign-event.entity';
import { EmailTemplate } from './entities/email-template.entity';
import { fakeRepo } from '../../common/testing/fake-repository';

interface Harness {
  templates: TemplatesService;
  campaigns: CampaignsService;
  templateRows: EmailTemplate[];
  campaignRows: Campaign[];
  eventRows: CampaignEvent[];
}

function buildHarness(): Harness {
  const templates = fakeRepo<EmailTemplate>();
  const campaigns = fakeRepo<Campaign>();
  const events = fakeRepo<CampaignEvent>();
  return {
    templates: new TemplatesService(templates.repo),
    campaigns: new CampaignsService(campaigns.repo, events.repo, templates.repo),
    templateRows: templates.rows,
    campaignRows: campaigns.rows,
    eventRows: events.rows,
  };
}

const BLOCKS = [
  { type: 'heading', text: 'Hello {{first_name}}' },
  { type: 'button', label: 'Shop now', url: 'https://shop.example.com/sale' },
];

describe('templates functional flows', () => {
  it('creates a draft template and refuses a duplicate name for the same owner', async () => {
    const h = buildHarness();
    const template = await h.templates.createTemplate('owner-a', {
      name: 'Welcome email',
      subject: 'Hi {{first_name}}!',
      blocks: BLOCKS,
    });
    expect(h.templateRows.length).toBe(1);
    expect(template.status).toBe('draft');
    await expect(
      h.templates.createTemplate('owner-a', {
        name: 'Welcome email',
        subject: 'x',
        blocks: BLOCKS,
      }),
    ).rejects.toThrow('template-name-exists');
    expect(h.templateRows.length).toBe(1);
  });

  it('refuses invalid blocks by name and leaves zero rows', async () => {
    const h = buildHarness();
    await expect(
      h.templates.createTemplate('owner-a', {
        name: 'Bad one',
        subject: 's',
        blocks: [{ type: 'spinner' }],
      }),
    ).rejects.toThrow('template-invalid-block-type');
    await expect(
      h.templates.createTemplate('owner-a', {
        name: 'Bad two',
        subject: 's',
        blocks: [{ type: 'image', url: 'http://x.example/i.jpg', alt: 'x' }],
      }),
    ).rejects.toThrow('template-invalid-image-url');
    await expect(
      h.templates.createTemplate('owner-a', {
        name: 'Bad three',
        subject: 's',
        blocks: [],
      }),
    ).rejects.toThrow('template-no-blocks');
    expect(h.templateRows.length).toBe(0);
  });

  it('publishes once and refuses the second publish, the unknown id and the foreign owner', async () => {
    const h = buildHarness();
    const template = await h.templates.createTemplate('owner-a', {
      name: 'Welcome email',
      subject: 'Hi {{first_name}}!',
      blocks: BLOCKS,
    });
    const published = await h.templates.publishTemplate('owner-a', template.id);
    expect(published.status).toBe('published');
    await expect(h.templates.publishTemplate('owner-a', template.id)).rejects.toThrow(
      'template-already-published',
    );
    await expect(h.templates.publishTemplate('owner-a', 'tpl-x')).rejects.toThrow(
      'template-not-found',
    );
    await expect(h.templates.publishTemplate('owner-b', template.id)).rejects.toThrow(
      'template-not-found',
    );
  });

  it('renders the preview with variables and refuses a missing variable value', async () => {
    const h = buildHarness();
    const template = await h.templates.createTemplate('owner-a', {
      name: 'Welcome email',
      subject: 'Hi {{first_name}}!',
      blocks: BLOCKS,
    });
    const preview = await h.templates.renderPreview('owner-a', template.id, {
      firstName: 'Ada',
    });
    expect(preview.subject).toBe('Hi Ada!');
    expect(preview.preview).toBe(
      'Hello Ada\n\n[button: Shop now](https://shop.example.com/sale)',
    );
    await expect(
      h.templates.renderPreview('owner-a', template.id, {}),
    ).rejects.toThrow('template-missing-variable');
  });
});

describe('campaigns functional flows', () => {
  it('creates a campaign, refuses duplicates and foreign templates', async () => {
    const h = buildHarness();
    const template = await h.templates.createTemplate('owner-a', {
      name: 'Welcome email',
      subject: 's',
      blocks: BLOCKS,
    });
    const campaign = await h.campaignsService.createCampaign('owner-a', {
      name: 'October sale',
      subject: 'October sale is live',
      templateId: template.id,
    });
    expect(h.campaignRows.length).toBe(1);
    expect(campaign.status).toBe('recorded');
    expect(campaign.templateId).toBe(template.id);
    await expect(
      h.campaignsService.createCampaign('owner-a', {
        name: 'October sale',
        subject: 'x',
      }),
    ).rejects.toThrow('campaign-name-exists');
    await expect(
      h.campaignsService.createCampaign('owner-b', {
        name: 'Foreign tpl',
        subject: 'x',
        templateId: template.id,
      }),
    ).rejects.toThrow('template-not-found');
    expect(h.campaignRows.length).toBe(1);
  });

  it('records honest events and refuses bad emails, bad types and foreign campaigns', async () => {
    const h = buildHarness();
    const campaign = await h.campaignsService.createCampaign('owner-a', {
      name: 'October sale',
      subject: 'October sale is live',
    });
    const events = [
      ['a@example.com', 'sent'],
      ['b@example.com', 'sent'],
      ['c@example.com', 'sent'],
      ['a@example.com', 'bounce'],
      ['b@example.com', 'open'],
      ['c@example.com', 'open'],
      ['b@example.com', 'click'],
      ['c@example.com', 'unsubscribe'],
    ] as const;
    for (const [email, eventType] of events) {
      await h.campaignsService.recordEvent('owner-a', campaign.id, { email, eventType });
    }
    expect(h.eventRows.length).toBe(8);
    await expect(
      h.campaignsService.recordEvent('owner-a', campaign.id, {
        email: 'bad-email',
        eventType: 'open',
      }),
    ).rejects.toThrow('analytics-invalid-email');
    await expect(
      h.campaignsService.recordEvent('owner-a', campaign.id, {
        email: 'x@example.com',
        eventType: 'forwarded',
      }),
    ).rejects.toThrow('analytics-invalid-event-type');
    await expect(
      h.campaignsService.recordEvent('owner-b', campaign.id, {
        email: 'x@example.com',
        eventType: 'open',
      }),
    ).rejects.toThrow('campaign-not-found');
    expect(h.eventRows.length).toBe(8);
  });

  it('computes the campaign summary with the exact industry formulas', async () => {
    const h = buildHarness();
    const campaign = await h.campaignsService.createCampaign('owner-a', {
      name: 'October sale',
      subject: 'October sale is live',
    });
    const events = [
      ['a@example.com', 'sent'],
      ['b@example.com', 'sent'],
      ['c@example.com', 'sent'],
      ['a@example.com', 'bounce'],
      ['b@example.com', 'open'],
      ['c@example.com', 'open'],
      ['b@example.com', 'click'],
      ['c@example.com', 'unsubscribe'],
    ] as const;
    for (const [email, eventType] of events) {
      await h.campaignsService.recordEvent('owner-a', campaign.id, { email, eventType });
    }
    const summary = await h.campaignsService.campaignSummary('owner-a', campaign.id);
    expect(summary).toEqual({
      recipients: 3,
      sent: 3,
      delivered: 2,
      opens: 2,
      uniqueClicks: 1,
      unsubscribes: 1,
      bounces: 1,
      openRate: 100,
      clickRate: 50,
      bounceRate: 33.33,
      unsubscribeRate: 50,
      deliveryRate: 66.67,
    });
  });

  it('isolates campaigns per owner and returns zeros for an empty campaign', async () => {
    const h = buildHarness();
    const campaignA = await h.campaignsService.createCampaign('owner-a', {
      name: 'October sale',
      subject: 's',
    });
    await h.campaignsService.recordEvent('owner-a', campaignA.id, {
      email: 'a@example.com',
      eventType: 'open',
    });
    await expect(
      h.campaignsService.campaignSummary('owner-b', campaignA.id),
    ).rejects.toThrow('campaign-not-found');
    const campaignB = await h.campaignsService.createCampaign('owner-b', {
      name: 'Empty one',
      subject: 'Nothing yet',
    });
    const empty = await h.campaignsService.campaignSummary('owner-b', campaignB.id);
    expect(empty.recipients).toBe(0);
    expect(empty.openRate).toBe(0);
    expect(empty.deliveryRate).toBe(0);
    const listA = await h.campaignsService.listCampaigns('owner-a');
    const listB = await h.campaignsService.listCampaigns('owner-b');
    expect(listA.length).toBe(1);
    expect(listA[0].userId).toBe('owner-a');
    expect(listB.length).toBe(1);
    expect(listB[0].userId).toBe('owner-b');
  });

  it('keeps templates isolated per owner', async () => {
    const h = buildHarness();
    await h.templates.createTemplate('owner-a', {
      name: 'Shared name',
      subject: 's',
      blocks: [{ type: 'divider' }],
    });
    await h.templates.createTemplate('owner-b', {
      name: 'Shared name',
      subject: 's',
      blocks: [{ type: 'divider' }],
    });
    const listA = await h.templates.listTemplates('owner-a');
    const listB = await h.templates.listTemplates('owner-b');
    expect(listA.length).toBe(1);
    expect(listA[0].userId).toBe('owner-a');
    expect(listB.length).toBe(1);
    expect(listB[0].userId).toBe('owner-b');
  });
});
