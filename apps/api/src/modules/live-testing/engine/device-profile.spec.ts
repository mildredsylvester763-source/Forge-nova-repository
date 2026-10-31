import { normalizeDeviceProfile, DEVICES, NETWORKS } from './device-profile';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('device catalog and network profile engine', () => {
  it('pins the low-end tier: throttling, platform and slow network numbers', () => {
    const v = normalizeDeviceProfile({ device: 'low-end-android', network: 'slow-3g' });
    expect(v.ok).toBe(true);
    expect(v.profile.lowEnd).toBe(true);
    expect(v.profile.cpuThrottle).toBe(4);
    expect(v.profile.platform).toBe('android');
    expect(v.profile.downlinkKbps).toBe(400);
    expect(v.profile.latencyMs).toBe(2000);
  });

  it('pins the offline network profile', () => {
    const v = normalizeDeviceProfile({ device: 'iphone-13', network: 'offline' });
    expect(v.ok).toBe(true);
    expect(v.profile.offline).toBe(true);
    expect(v.profile.downlinkKbps).toBe(0);
  });

  it('normalizes case and padding in device and network names', () => {
    const v = normalizeDeviceProfile({ device: ' Pixel-5 ', network: 'WiFi' });
    expect(v.ok).toBe(true);
    expect(v.profile.device).toBe('pixel-5');
    expect(v.profile.network).toBe('wifi');
  });

  it('refuses unknown devices and networks, non-objects and missing fields', () => {
    let v = normalizeDeviceProfile({ device: 'tv-box', network: 'wifi' });
    expect(v.reason).toBe('device-unknown:tv-box');
    v = normalizeDeviceProfile({ device: 'pixel-5', network: '5g-plus' });
    expect(v.reason).toBe('network-unknown:5g-plus');
    v = normalizeDeviceProfile(null);
    expect(v.reason).toBe('deviceprofile-not-object');
    v = normalizeDeviceProfile({ network: 'wifi' });
    expect(v.reason).toBe('device-missing');
    v = normalizeDeviceProfile({ device: 'pixel-5' });
    expect(v.reason).toBe('network-missing');
  });

  it('pins the catalog sizes', () => {
    expect(DEVICES).toHaveLength(12);
    expect(NETWORKS).toHaveLength(6);
  });

  it('survives a 500-case sweep of known and junk names', () => {
    const rnd = mulberry32(42);
    const knownDevices = DEVICES.map((d) => d.device);
    const knownNetworks = NETWORKS.map((n) => n.network);
    const junk = ['tv-box', 'fridge-os', 'watch-3', '', '  '];
    for (let i = 0; i < 500; i++) {
      const dev = rnd() < 0.7 ? knownDevices[Math.floor(rnd() * knownDevices.length)] : junk[Math.floor(rnd() * junk.length)];
      const net = rnd() < 0.7 ? knownNetworks[Math.floor(rnd() * knownNetworks.length)] : junk[Math.floor(rnd() * junk.length)];
      const v = normalizeDeviceProfile({ device: dev, network: net });
      const devName = dev.trim().toLowerCase();
      const netName = net.trim().toLowerCase();
      const devKnown = knownDevices.includes(devName) && devName.length > 0;
      const netKnown = knownNetworks.includes(netName) && netName.length > 0;
      if (devName.length === 0) {
        expect(v.reason).toBe('device-missing');
      } else if (!devKnown) {
        expect(v.reason).toBe('device-unknown:' + devName);
      } else if (netName.length === 0) {
        expect(v.reason).toBe('network-missing');
      } else if (!netKnown) {
        expect(v.reason).toBe('network-unknown:' + netName);
      } else {
        const spec = DEVICES.find((x) => x.device === devName) as any;
        const nspec = NETWORKS.find((x) => x.network === netName) as any;
        expect(v.ok).toBe(true);
        expect(v.profile.device).toBe(spec.device);
        expect(v.profile.network).toBe(nspec.network);
        expect(v.profile.platform).toBe(spec.platform);
        expect(v.profile.lowEnd).toBe(spec.lowEnd);
        expect(v.profile.cpuThrottle).toBe(spec.cpuThrottle);
        expect(v.profile.offline).toBe(nspec.offline);
        expect(v.profile.downlinkKbps).toBe(nspec.downlinkKbps);
        expect(v.profile.latencyMs).toBe(nspec.latencyMs);
      }
    }
  });
});
