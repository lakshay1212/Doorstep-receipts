/**
 * Minimal Ring Partner API client. Ring ships no official SDK, so this is plain fetch.
 * Only used to populate the device picker; the core product runs on webhooks alone.
 *
 * UNVERIFIED against a live account: JSON:API attribute names for devices are read
 * defensively (name / label / id). Check them against GET /v1/devices on your account.
 */
export interface DeviceChoice {
  id: string;
  name: string;
}

export const RING_API_BASE = 'https://api.amazonvision.com';

export async function listDevices(accessToken: string): Promise<DeviceChoice[]> {
  const res = await fetch(`${RING_API_BASE}/v1/devices?include=status,capabilities`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.api+json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Ring API responded ${res.status}`);
  const body = (await res.json()) as {
    data?: Array<{ id?: string; attributes?: Record<string, unknown> }>;
  };
  return (body.data ?? [])
    .filter((d) => typeof d.id === 'string')
    .map((d) => {
      const a = d.attributes ?? {};
      const name = [a.name, a.label, a.display_name].find((v) => typeof v === 'string') as
        | string
        | undefined;
      return { id: d.id as string, name: name ?? (d.id as string) };
    });
}

export const DEMO_DEVICES: DeviceChoice[] = [
  { id: 'sim-doorbell-front', name: 'Front door (simulated Ring Doorbell)' },
  { id: 'sim-doorbell-side', name: 'Side gate (simulated Ring Doorbell)' },
];
