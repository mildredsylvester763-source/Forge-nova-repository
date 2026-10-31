import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { fakeRepo } from '../../common/testing/fake-repository';
import { Site } from './entities/site.entity';
import { SitePage } from './entities/site-page.entity';
import { SiteDomain } from './entities/site-domain.entity';
import { SitesService } from './sites.service';
import { DomainsService } from './domains.service';
import { verificationToken } from './engine/domain-engine';

// Multi-user scenarios for the website builder and custom domains: real
// services on the shared fake repositories, draft and publish states, page
// slugs per site, TXT challenge verification, exactly one primary domain,
// and per-owner isolation. Refusals leave zero side effects.

function build() {
  const sites = fakeRepo<Site>();
  const pages = fakeRepo<SitePage>();
  const domains = fakeRepo<SiteDomain>();
  const sitesService = new SitesService(sites.repo, pages.repo);
  const domainsService = new DomainsService(sites.repo, domains.repo);
  return {
    sitesService,
    domainsService,
    siteRows: sites.rows,
    pageRows: pages.rows,
    domainRows: domains.rows,
  };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error('expected a refusal but the call succeeded');
  } catch (error) {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      return String((error as { message?: string }).message);
    }
    throw error;
  }
}

const homeBlocks = [
  { type: 'heading', text: 'Welcome to Mildred Cakes' },
  { type: 'text', text: 'Fresh cakes every morning.' },
];

describe('websites functional scenarios', () => {
  it('creates sites as drafts and refuses duplicate names per owner', async () => {
    const ctx = build();
    const site = await ctx.sitesService.createSite('owner-a', { name: '  Mildred Cakes  ', template: 'warm' });
    expect(site.name).toBe('Mildred Cakes');
    expect(site.status).toBe('draft');
    expect(site.publishedAt).toBeNull();
    expect(
      await refusal(ctx.sitesService.createSite('owner-a', { name: 'mildred cakes', template: 'clean' })),
    ).toBe('site-name-exists');
    await ctx.sitesService.createSite('owner-b', { name: 'Mildred Cakes', template: 'clean' });
    expect(
      await refusal(ctx.sitesService.createSite('owner-a', { name: 'Second', template: 'sparkly' })),
    ).toBe('site-invalid-template');
    expect(ctx.siteRows).toHaveLength(2);
  });

  it('adds pages with normalised slugs and refuses duplicate slugs per site', async () => {
    const ctx = build();
    const site = await ctx.sitesService.createSite('owner-a', { name: 'Mildred Cakes', template: 'warm' });
    const page = await ctx.sitesService.addPage('owner-a', site.id, {
      title: '  Home  ',
      slug: '  HOME  ',
      blocks: [{ type: 'heading', text: '  Welcome  ' }],
    });
    expect(page.slug).toBe('home');
    expect(page.title).toBe('Home');
    expect(page.blocks).toEqual([{ type: 'heading', text: 'Welcome' }]);
    expect(page.position).toBe(0);
    const second = await ctx.sitesService.addPage('owner-a', site.id, {
      title: 'About',
      slug: 'about-us',
      blocks: homeBlocks,
    });
    expect(second.position).toBe(1);
    expect(
      await refusal(
        ctx.sitesService.addPage('owner-a', site.id, { title: 'Again', slug: 'home', blocks: homeBlocks }),
      ),
    ).toBe('page-slug-exists');
    expect(
      await refusal(
        ctx.sitesService.addPage('owner-a', site.id, { title: 'Bad', slug: 'Bad Slug', blocks: homeBlocks }),
      ),
    ).toBe('page-invalid-slug');
    expect(ctx.pageRows).toHaveLength(2);
  });

  it('refuses to publish a site without pages, with zero side effects', async () => {
    const ctx = build();
    const site = await ctx.sitesService.createSite('owner-a', { name: 'Mildred Cakes', template: 'warm' });
    expect(await refusal(ctx.sitesService.publishSite('owner-a', site.id))).toBe('site-no-pages');
    expect(ctx.siteRows[0].status).toBe('draft');
    expect(ctx.siteRows[0].publishedAt).toBeNull();
  });

  it('publishes and unpublishes honestly, recording the moment', async () => {
    const ctx = build();
    const site = await ctx.sitesService.createSite('owner-a', { name: 'Mildred Cakes', template: 'warm' });
    await ctx.sitesService.addPage('owner-a', site.id, { title: 'Home', slug: 'home', blocks: homeBlocks });
    const published = await ctx.sitesService.publishSite('owner-a', site.id);
    expect(published.status).toBe('published');
    expect(published.pageCount).toBe(1);
    expect(published.publishedAt).toBeInstanceOf(Date);
    const again = await ctx.sitesService.publishSite('owner-a', site.id);
    expect(again.status).toBe('published');
    const unpublished = await ctx.sitesService.unpublishSite('owner-a', site.id);
    expect(unpublished.status).toBe('draft');
    expect(unpublished.publishedAt).toBeNull();
    expect(ctx.siteRows[0].status).toBe('draft');
  });

  it('keeps sites invisible across owners', async () => {
    const ctx = build();
    const site = await ctx.sitesService.createSite('owner-a', { name: 'Mildred Cakes', template: 'warm' });
    await ctx.sitesService.addPage('owner-a', site.id, { title: 'Home', slug: 'home', blocks: homeBlocks });
    expect(await refusal(ctx.sitesService.addPage('owner-b', site.id, { title: 'X', slug: 'x', blocks: homeBlocks }))).toBe('site-not-found');
    expect(await refusal(ctx.sitesService.publishSite('owner-b', site.id))).toBe('site-not-found');
    expect(await refusal(ctx.sitesService.listPages('owner-b', site.id))).toBe('site-not-found');
    expect(await refusal(ctx.domainsService.addDomain('owner-b', site.id, { domain: 'shop.com' }))).toBe('site-not-found');
    const listB = await ctx.sitesService.listSites('owner-b');
    expect(listB).toHaveLength(0);
  });

  it('adds domains with a TXT challenge and refuses duplicates per owner', async () => {
    const ctx = build();
    const siteA = await ctx.sitesService.createSite('owner-a', { name: 'Mildred Cakes', template: 'warm' });
    const added = await ctx.domainsService.addDomain('owner-a', siteA.id, { domain: '  Shop.MildredNg.COM  ' });
    expect(added.domain).toBe('shop.mildredng.com');
    expect(added.status).toBe('pending');
    expect(added.txtHost).toBe('_forge-challenge.shop.mildredng.com');
    expect(added.txtValue).toBe(verificationToken('owner-a', 'shop.mildredng.com'));
    expect(
      await refusal(ctx.domainsService.addDomain('owner-a', siteA.id, { domain: 'shop.mildredng.com' })),
    ).toBe('domain-exists');
    expect(
      await refusal(ctx.domainsService.addDomain('owner-a', siteA.id, { domain: 'https://nope.com' })),
    ).toBe('domain-invalid-name');
    const siteB = await ctx.sitesService.createSite('owner-b', { name: 'Other Shop', template: 'clean' });
    await ctx.domainsService.addDomain('owner-b', siteB.id, { domain: 'shop.mildredng.com' });
    expect(ctx.domainRows).toHaveLength(2);
  });

  it('verifies only the exact TXT value, leaving pending rows untouched on mismatch', async () => {
    const ctx = build();
    const site = await ctx.sitesService.createSite('owner-a', { name: 'Mildred Cakes', template: 'warm' });
    const added = await ctx.domainsService.addDomain('owner-a', site.id, { domain: 'shop.mildredng.com' });
    expect(
      await refusal(ctx.domainsService.verifyDomain('owner-a', site.id, added.id, { txtValue: 'wrong-value' })),
    ).toBe('domain-verification-mismatch');
    expect(ctx.domainRows[0].status).toBe('pending');
    expect(ctx.domainRows[0].verifiedAt).toBeNull();
    const verified = await ctx.domainsService.verifyDomain('owner-a', site.id, added.id, {
      txtValue: added.txtValue,
    });
    expect(verified.status).toBe('verified');
    expect(verified.verifiedAt).toBeInstanceOf(Date);
    expect(
      await refusal(ctx.domainsService.verifyDomain('owner-a', site.id, 'missing', { txtValue: 'x' })),
    ).toBe('domain-not-found');
  });

  it('makes exactly one verified domain the primary and refuses unverified ones', async () => {
    const ctx = build();
    const site = await ctx.sitesService.createSite('owner-a', { name: 'Mildred Cakes', template: 'warm' });
    const first = await ctx.domainsService.addDomain('owner-a', site.id, { domain: 'mildredcakes.com' });
    const second = await ctx.domainsService.addDomain('owner-a', site.id, { domain: 'shop.mildredng.com' });
    expect(await refusal(ctx.domainsService.setPrimary('owner-a', site.id, first.id))).toBe('domain-not-verified');
    await ctx.domainsService.verifyDomain('owner-a', site.id, first.id, { txtValue: first.txtValue });
    await ctx.domainsService.verifyDomain('owner-a', site.id, second.id, { txtValue: second.txtValue });
    const primary = await ctx.domainsService.setPrimary('owner-a', site.id, first.id);
    expect(primary.isPrimary).toBe(true);
    const rowFirst = ctx.domainRows.find((row) => row.id === first.id);
    const rowSecond = ctx.domainRows.find((row) => row.id === second.id);
    if (!rowFirst || !rowSecond) {
      throw new Error('expected both domain rows');
    }
    expect(rowFirst.isPrimary).toBe(true);
    expect(rowSecond.isPrimary).toBe(false);
    await ctx.domainsService.setPrimary('owner-a', site.id, second.id);
    expect(rowFirst.isPrimary).toBe(false);
    expect(rowSecond.isPrimary).toBe(true);
  });

  it('keeps domain ownership isolated across owners', async () => {
    const ctx = build();
    const siteA = await ctx.sitesService.createSite('owner-a', { name: 'Mildred Cakes', template: 'warm' });
    const siteB = await ctx.sitesService.createSite('owner-b', { name: 'Other Shop', template: 'clean' });
    const added = await ctx.domainsService.addDomain('owner-a', siteA.id, { domain: 'mildredcakes.com' });
    expect(
      await refusal(ctx.domainsService.verifyDomain('owner-b', siteB.id, added.id, { txtValue: added.txtValue })),
    ).toBe('domain-not-found');
    const listB = await ctx.domainsService.listDomains('owner-b', siteB.id);
    expect(listB).toHaveLength(0);
  });
});
