import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MINUTE } from '../src/domain/format.js';
import { evaluateVisit, offlineSpans, routeSignal } from '../src/domain/visit.js';
import type { DbShape, DeviceStatusChange, Visit } from '../src/types.js';

const T0 = Date.UTC(2026, 9, 13, 9, 0); // 9:00 UTC window start
const at = (min: number) => T0 + min * MINUTE;

function visit(over: Partial<Visit> = {}): Visit {
  return {
    id: 'v1',
    accountId: 'acct',
    deviceId: 'door',
    title: 'Boiler service',
    contractor: 'Demo Plumbing',
    timeZone: 'UTC',
    windowStart: at(0),
    windowEnd: at(120), // 9:00 to 11:00
    earlyGraceMin: 15,
    lateGraceMin: 90,
    createdAt: at(-1000),
    signals: [],
    departureConfirmedAt: null,
    share: null,
    summary: null,
    ...over,
  };
}
const dbWith = (...visits: Visit[]): DbShape => ({
  visits,
  deviceLog: [],
  seenRequestIds: [],
  counters: { kept: 0, discarded: 0 },
});
const sig = (min: number, over = {}) => ({
  accountId: 'acct',
  deviceId: 'door',
  id: `door_button_press_${min}`,
  kind: 'button_press' as const,
  at: at(min),
  ...over,
});
const NOW_AFTER = at(500);

test('keeps signals inside the watch period and discards the rest', () => {
  const db = dbWith(visit());
  assert.equal(routeSignal(db, sig(30), NOW_AFTER), 1); // inside window
  assert.equal(routeSignal(db, sig(-10, { id: 'a' }), NOW_AFTER), 1); // early grace
  assert.equal(routeSignal(db, sig(150, { id: 'b' }), NOW_AFTER), 1); // late grace
  assert.equal(routeSignal(db, sig(-16, { id: 'c' }), NOW_AFTER), 0); // before watch
  assert.equal(routeSignal(db, sig(211, { id: 'd' }), NOW_AFTER), 0); // after watch
  assert.equal(db.visits[0]!.signals.length, 3);
  assert.deepEqual(db.counters, { kept: 3, discarded: 2 });
});

test('discards signals for another door or another account', () => {
  const db = dbWith(visit());
  assert.equal(routeSignal(db, sig(30, { deviceId: 'side' }), NOW_AFTER), 0);
  assert.equal(routeSignal(db, sig(30, { accountId: 'someone-else' }), NOW_AFTER), 0);
  assert.equal(db.visits[0]!.signals.length, 0);
});

test('rejects signals dated in the future', () => {
  const db = dbWith(visit());
  assert.equal(routeSignal(db, sig(30), at(0)), 0); // "now" is 30 min before the signal
  assert.equal(db.visits[0]!.signals.length, 0);
});

test('duplicate event ids are stored once', () => {
  const db = dbWith(visit());
  routeSignal(db, sig(30), NOW_AFTER);
  routeSignal(db, sig(30), NOW_AFTER);
  assert.equal(db.visits[0]!.signals.length, 1);
});

test('classifies on time, early and late arrivals', () => {
  const mk = (min: number) => visit({ signals: [{ id: 's', deviceId: 'door', kind: 'button_press', at: at(min), excluded: false }] });
  assert.equal(evaluateVisit(mk(47), [], NOW_AFTER).outcome, 'on_time');
  assert.equal(evaluateVisit(mk(-10), [], NOW_AFTER).outcome, 'early');
  assert.equal(evaluateVisit(mk(140), [], NOW_AFTER).outcome, 'late');
  assert.match(evaluateVisit(mk(140), [], NOW_AFTER).headline, /20 min after the window closed/);
});

test('excluded signals do not count as an arrival', () => {
  const v = visit({ signals: [{ id: 's', deviceId: 'door', kind: 'button_press', at: at(30), excluded: true }] });
  const ev = evaluateVisit(v, [], NOW_AFTER);
  assert.equal(ev.arrival, null);
  assert.equal(ev.outcome, 'no_arrival_detected');
});

test('phases follow the clock', () => {
  assert.equal(evaluateVisit(visit(), [], at(-60)).phase, 'scheduled');
  assert.equal(evaluateVisit(visit(), [], at(-60)).outcome, 'pending');
  assert.equal(evaluateVisit(visit(), [], at(30)).phase, 'watching');
  assert.equal(evaluateVisit(visit(), [], NOW_AFTER).phase, 'closed');
});

test('no arrival after the watch period is "not detected", unless the camera was offline', () => {
  assert.equal(evaluateVisit(visit(), [], NOW_AFTER).outcome, 'no_arrival_detected');
  const log: DeviceStatusChange[] = [{ deviceId: 'door', status: 'offline', at: at(20) }];
  const ev = evaluateVisit(visit(), log, NOW_AFTER);
  assert.equal(ev.outcome, 'inconclusive_offline');
  assert.ok(ev.offlineMinutes >= 10);
});

test('a short offline blip does not make no-arrival inconclusive', () => {
  const log: DeviceStatusChange[] = [
    { deviceId: 'door', status: 'offline', at: at(20) },
    { deviceId: 'door', status: 'online', at: at(25) },
  ];
  assert.equal(evaluateVisit(visit(), log, NOW_AFTER).outcome, 'no_arrival_detected');
});

test('time on site: confirmed beats estimated, and tiny spans are not reported', () => {
  const s = (min: number, id: string) => ({ id, deviceId: 'door', kind: 'button_press' as const, at: at(min), excluded: false });
  const est = evaluateVisit(visit({ signals: [s(10, 'a'), s(55, 'b')] }), [], NOW_AFTER);
  assert.deepEqual(est.onSite, { minutes: 45, basis: 'estimated' });
  const conf = evaluateVisit(visit({ signals: [s(10, 'a'), s(55, 'b')], departureConfirmedAt: at(70) }), [], NOW_AFTER);
  assert.deepEqual(conf.onSite, { minutes: 60, basis: 'confirmed' });
  const tiny = evaluateVisit(visit({ signals: [s(10, 'a'), { ...s(10, 'b'), at: at(10) + 20_000 }] }), [], NOW_AFTER);
  assert.equal(tiny.onSite, null);
});

test('offlineSpans handles a device already offline at the start', () => {
  const log: DeviceStatusChange[] = [
    { deviceId: 'door', status: 'offline', at: at(-100) },
    { deviceId: 'door', status: 'online', at: at(30) },
    { deviceId: 'other', status: 'offline', at: at(0) },
  ];
  const spans = offlineSpans(log, 'door', at(0), at(60));
  assert.deepEqual(spans, [{ from: at(0), to: at(30) }]);
});
