import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  measurementText, measurementTrend, measurementUnit, metrics, periods, rawMeasurement,
  type BodyRecord, type MeasurementUnits, type Metric, type TrendPeriod,
} from './body-measurements';
import { dayDate } from './calendar';
import { useLanguage } from './language';
import { Card, Choice, colors, styles } from './ui';

const plotHeight = 154;
const inset = 7;

export function BodyTrend({ records, today, units, setUnits, metric, setMetric, period, setPeriod }: {
  records: BodyRecord[];
  today: string;
  units: MeasurementUnits;
  setUnits: (units: MeasurementUnits) => void;
  metric: Metric;
  setMetric: (metric: Metric) => void;
  period: TrendPeriod;
  setPeriod: (period: TrendPeriod) => void;
}) {
  const { language, t } = useLanguage();
  const trend = measurementTrend(records, metric, units, today, period);
  const latest = records.find((record) => record.day <= today && rawMeasurement(record, metric) !== null);
  const latestValue = latest ? rawMeasurement(latest, metric) : null;
  const unit = measurementUnit(metric, units);
  const date = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' });

  return (
    <Card title={t.bodyTrend} icon="scale">
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t.bodyMetric}>
        {metrics.map((key) => (
          <Choice key={key} label={t[key]} selected={key === metric} disabled={false} onPress={() => setMetric(key)} />
        ))}
      </View>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t.bodyPeriod}>
        {periods.map((days) => (
          <Choice key={days} label={`${days} ${t.bodyDays}`} selected={days === period}
            disabled={false} onPress={() => setPeriod(days)} />
        ))}
      </View>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t.measurementUnits}>
        {(['metric', 'imperial'] as const).map((option) => (
          <Choice key={option} label={t[option]} selected={units === option} disabled={false}
            onPress={() => setUnits(option)} />
        ))}
      </View>
      {latest && latestValue !== null && (
        <View>
          <Text style={styles.secondary}>{t.bodyLatest} · {date.format(dayDate(latest.day))}</Text>
          <Text style={chartStyles.value}>
            {measurementText(latestValue, metric, units)} <Text style={chartStyles.unit}>{unit}</Text>
          </Text>
        </View>
      )}
      {trend.points.length > 0 ? (
        <>
          <View style={chartStyles.frame}>
            <ProgressPlot points={trend.points} unit={unit}
              description={`${t[metric]} · ${trend.points.length} ${t.bodyPointCount} · ${trend.start} – ${trend.end}`} />
            <View style={chartStyles.dates}>
              <Text style={styles.secondary}>{date.format(dayDate(trend.start))}</Text>
              <Text style={styles.secondary}>{date.format(dayDate(trend.end))}</Text>
            </View>
          </View>
          <Text style={styles.secondary}>{t.bodyChartNote}</Text>
        </>
      ) : <View style={chartStyles.frame}><Text style={styles.secondary}>{t.bodyNoChartData}</Text></View>}
    </Card>
  );
}

export function ProgressPlot({ points, unit, description }: {
  points: { day: string; fraction: number; value: number }[];
  unit: string;
  description: string;
}) {
  const { language } = useLanguage();
  const [width, setWidth] = useState(0);
  const low = Math.min(...points.map((point) => point.value));
  const high = Math.max(...points.map((point) => point.value));
  const step = Math.max(0.5, Math.ceil((high - low) / 2));
  const bottom = Math.max(0, Math.floor((low - step / 2) / step) * step);
  const top = Math.max(bottom + step * 2, Math.ceil((high + step / 2) / step) * step);
  const axis = [top, (top + bottom) / 2, bottom];
  const number = new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en', { maximumFractionDigits: 2 });
  const coordinates = width > 2 * inset ? points.map((point) => ({
    day: point.day,
    x: inset + point.fraction * (width - 2 * inset),
    y: inset + (top - point.value) / (top - bottom) * (plotHeight - 2 * inset),
  })) : [];

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={description} style={chartStyles.chart}>
      <View style={chartStyles.axis}>
        {axis.map((value) => <Text key={value} style={chartStyles.axisText}>{number.format(value)} {unit}</Text>)}
      </View>
      <View style={chartStyles.plot} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {axis.map((value, index) => (
          <View key={value} style={[chartStyles.grid, { top: inset + index * (plotHeight - 2 * inset) / 2 }]} />
        ))}
        {coordinates.slice(1).map((point, index) => {
          const previous = coordinates[index];
          const dx = point.x - previous.x;
          const dy = point.y - previous.y;
          const length = Math.hypot(dx, dy);
          return <View key={point.day} style={[chartStyles.line, {
            width: length,
            left: (previous.x + point.x - length) / 2,
            top: (previous.y + point.y) / 2 - 1,
            transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
          }]} />;
        })}
        {coordinates.map((point) => (
          <View key={point.day} style={[chartStyles.point, { left: point.x - 4, top: point.y - 4 }]} />
        ))}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  value: { color: colors.text, fontSize: 36, fontWeight: '900', letterSpacing: -0.9, fontVariant: ['tabular-nums'] },
  unit: { color: colors.muted, fontSize: 15, letterSpacing: 0 },
  frame: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
    borderRadius: 16, padding: 11, gap: 8 },
  chart: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  axis: { height: plotHeight + 6, justifyContent: 'space-between' },
  axisText: { color: colors.muted, fontSize: 11, textAlign: 'right', fontVariant: ['tabular-nums'] },
  plot: { position: 'relative', flex: 1, height: plotHeight },
  grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  line: { position: 'absolute', height: 2, backgroundColor: colors.accent, opacity: 0.62 },
  point: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  dates: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
});
