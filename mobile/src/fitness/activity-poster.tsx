import { Image } from 'expo-image';
import type { ComponentRef, Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ActivityRow } from './activity-export';
import { useLanguage } from './language';

const cover = require('@/assets/images/training-cover.jpg');

export function ActivityPoster({ rows, title, dates, result, dinner, viewRef, onReady }: {
  rows: ActivityRow[]; title: string; dates: string; result: boolean;
  dinner?: string[];
  viewRef: Ref<ComponentRef<typeof View>>; onReady: () => void;
}) {
  const { t } = useLanguage();
  const formal = rows.filter((row) => row.kind === 'strength');
  const warmup = rows.filter((row) => row.kind === 'warmup');
  const runs = rows.filter((row) => row.kind === 'run');
  const metric = (items: ActivityRow[]) => result
    ? `${items.filter((row) => row.status !== 'exportPending').length}/${items.length}` : String(items.length);
  const days = [...new Set(rows.map((row) => row.day))];
  return <View ref={viewRef} collapsable={false} style={poster.sheet}>
    <View style={poster.hero}>
      <Image source={cover} contentFit="cover" contentPosition="top right" style={StyleSheet.absoluteFill}
        onLoad={onReady} onError={onReady} />
      <View style={poster.shade} />
      <View style={poster.lettering}>
        <Text style={poster.brand}>{t.exportPosterBrand}</Text>
        <Text style={poster.title}>{title}</Text>
        <Text style={poster.date}>{dates}</Text>
      </View>
    </View>
    <View style={poster.metrics}>
      {([['exportGroupFormal', formal], ['exportGroupWarmup', warmup], ['runTitle', runs]] as const)
        .map(([key, items]) => <View key={key} style={poster.metric}>
          <Text style={poster.metricValue}>{metric(items)}</Text>
          <Text style={poster.metricLabel}>{t[key]}</Text>
        </View>)}
    </View>
    <View style={poster.content}>
      <Text style={poster.section}>{t[result ? 'exportRecordDetails' : 'exportDetails']}</Text>
      {days.map((day) => {
        const slots = new Map<string, ActivityRow[]>();
        for (const row of rows) {
          if (row.day !== day) continue;
          const key = `${row.kind}/${row.name}`;
          slots.set(key, [...(slots.get(key) ?? []), row]);
        }
        return <View key={day} style={poster.day}>
          {days.length > 1 && <Text style={poster.dayLabel}>{day}</Text>}
          {[...slots].map(([key, group]) => {
            const first = group[0];
            const goals = [...new Set(group.map((row) => [row.load, row.target].filter(Boolean).join(' × ')))].filter(Boolean);
            const details = group.filter((row) => row.actual).map((row) => row.actual);
            const checkOnly = group.filter((row) => row.status === 'exportConfirmed').length;
            const setGroup = first.kind === 'strength' ? t.exportGroupFormal : t.exportGroupWarmup;
            return <View key={key} style={poster.move}>
              <View style={poster.moveHead}>
                <Text style={poster.moveName}>{first.name}</Text>
                <Text style={poster.moveCount}>{first.kind === 'run'
                  ? result ? t[first.status] : first.target : `${setGroup} ${metric(group)}`}</Text>
              </View>
              {goals.length > 0 && first.kind !== 'run' && <Text style={poster.moveText}>
                {t.exportTarget} · {goals.join(' · ')}{first.rest ? `  |  ${t.planRest} ${first.rest}` : ''}
              </Text>}
              {result && checkOnly > 0 && first.kind !== 'run' && <Text style={poster.moveText}>{t.checkOnly} · {checkOnly}</Text>}
              {result && details.length > 0 && <Text style={poster.moveText}>{t.exportActual} · {details.join(' / ')}</Text>}
            </View>;
          })}
        </View>;
      })}
      {!!dinner?.length && <View style={poster.move}>
        <Text style={poster.moveName}>{t.posterDinner}</Text>
        <Text style={poster.moveText}>{dinner.join(' / ')}</Text>
      </View>}
    </View>
  </View>;
}

const poster = StyleSheet.create({
  sheet: { backgroundColor: '#101211', borderColor: '#3C3027', borderWidth: 1, overflow: 'hidden' },
  hero: { minHeight: 182, justifyContent: 'flex-end', backgroundColor: '#141412' },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11, 12, 10, 0.61)' },
  lettering: { paddingHorizontal: 19, paddingVertical: 21, gap: 7 },
  brand: { color: '#FF9358', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#FFFAF3', fontSize: 32, fontWeight: '900' },
  date: { color: '#F4EEE7', fontSize: 13, fontWeight: '600' },
  metrics: { flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 12, backgroundColor: '#231B16', gap: 8 },
  metric: { flex: 1, minWidth: 0, padding: 5 },
  metricValue: { color: '#FF9358', fontSize: 24, fontWeight: '900' },
  metricLabel: { color: '#E6DCD0', fontSize: 11, fontWeight: '600' },
  content: { padding: 14, gap: 10 },
  section: { color: '#FFFAF3', fontWeight: '800', fontSize: 17 },
  day: { gap: 7 },
  dayLabel: { color: '#FFA876', fontWeight: '700', fontSize: 12 },
  move: { padding: 9, gap: 4, backgroundColor: '#1E201E', borderLeftColor: '#FF8950', borderLeftWidth: 3 },
  moveHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  moveName: { color: '#FFFAF3', fontWeight: '700', fontSize: 14 },
  moveCount: { color: '#FFAA7D', fontWeight: '700', fontSize: 11 },
  moveText: { color: '#D9D0C5', fontSize: 11, lineHeight: 16 },
});
