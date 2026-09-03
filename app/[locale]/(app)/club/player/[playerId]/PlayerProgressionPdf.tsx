import { Fragment } from "react";
import { Document, Page, View, Text, Image, Svg, Path, Circle, Line, Link, StyleSheet } from "@react-pdf/renderer";
import type { ProgressionReportData } from "./PlayerProgressionReport";
import type { WeightEntry } from "./PlayerBodyMetrics";

// react-pdf renders this tree outside the app's normal React context (it's
// instantiated imperatively via pdf(<... />), not mounted in the page) —
// no next-intl provider reaches it, so every string comes in pre-translated
// through `labels` instead of calling useTranslations() in here.
export interface PdfLabels {
  title: string;
  generatedOn: string;
  performanceTitle: string;
  seasonTitle: string;
  appearances: string;
  rating: string;
  goalsOrSaves: string;
  assistsOrConceded: string;
  minutes: string;
  physicalTitle: string;
  height: string;
  weight: string;
  sinceLast: string;
  sinceStart: string;
  weightChartTitle: string;
  weightChartNotEnoughData: string;
  trackingTitle: string;
  notes: string;
  videos: string;
  notesEmpty: string;
  videosEmpty: string;
  availabilityTitle: string;
  status: string;
  statusValue: string;
  injuries: string;
  injuriesEmpty: string;
  injuryOngoing: string;
  injuryExpectedReturnLabel: string;
  durationDaysLabel: (count: number) => string;
  footerNote: string;
}

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 56, fontSize: 10, fontFamily: "Helvetica", color: "#1f2937" },
  watermark: {
    position: "absolute",
    top: "30%",
    left: "20%",
    width: 260,
    height: 260,
    opacity: 0.05,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 2,
  },
  photo: { width: 56, height: 56, borderRadius: 28, marginRight: 12 },
  headerText: { flex: 1 },
  playerName: { fontSize: 18, fontWeight: 700 },
  clubLine: { fontSize: 10, color: "#4b5563", marginTop: 2 },
  reportTitle: { fontSize: 9, color: "#4b5563", textAlign: "right" },
  generatedOn: { fontSize: 8, color: "#6b7280", textAlign: "right", marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  card: { width: "50%", paddingRight: 14, marginBottom: 18 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fullSection: { marginBottom: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  rowAlt: { backgroundColor: "#f9fafb" },
  label: { color: "#4b5563" },
  value: { fontWeight: 700 },
  weightBlock: {
    marginTop: 6,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 6,
  },
  bigValue: { fontSize: 20, fontWeight: 700, marginTop: 2 },
  muted: { fontSize: 9, color: "#6b7280" },
  chartAxisLabel: { position: "absolute", fontSize: 8, color: "#4b5563", fontWeight: 700 },
  chartPointLabel: {
    position: "absolute",
    width: 30,
    fontSize: 7,
    fontWeight: 700,
    textAlign: "center",
  },
  card2: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
  },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  cardDate: { fontSize: 8, color: "#6b7280" },
  cardBadge: {
    fontSize: 7,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: "#ffffff",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  cardBadge2: {
    fontSize: 7,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: "#92400e",
    backgroundColor: "#fef3c7",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  cardBody: { fontSize: 9, lineHeight: 1.4 },
  cardLink: { fontSize: 9, textDecoration: "underline" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#6b7280",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
});

function Row({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <View style={alt ? [styles.row, styles.rowAlt] : styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function fmtDelta(value: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "";
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return " (=)";
  return ` (${rounded > 0 ? "+" : ""}${rounded})`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

// Same scale/line math as the on-page PlayerWeightChart, rebuilt with
// react-pdf's own Svg primitives since that HTML/DOM chart can't be reused
// inside a PDF document tree.
const CHART_WIDTH = 515;
const CHART_HEIGHT = 150;
const CHART_PAD_X = 10;
const CHART_PAD_TOP = 14;
const CHART_PAD_BOTTOM = 22;

function buildWeightChartGeometry(entries: WeightEntry[]) {
  const points = entries.slice().sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  if (points.length < 2) return null;

  const dates = points.map((p) => new Date(p.recordedAt).getTime());
  const weights = points.map((p) => p.weightKg);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const weightPad = Math.max((maxWeight - minWeight) * 0.15, 0.5);
  const yMin = minWeight - weightPad;
  const yMax = maxWeight + weightPad;
  const dateSpan = maxDate - minDate || 1;
  const weightSpan = yMax - yMin || 1;

  function xFor(dateMs: number) {
    return CHART_PAD_X + ((dateMs - minDate) / dateSpan) * (CHART_WIDTH - CHART_PAD_X * 2);
  }
  function yFor(weight: number) {
    return (
      CHART_HEIGHT - CHART_PAD_BOTTOM - ((weight - yMin) / weightSpan) * (CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM)
    );
  }

  const coords = points.map((p) => ({
    x: xFor(new Date(p.recordedAt).getTime()),
    y: yFor(p.weightKg),
    entry: p,
  }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return {
    points,
    coords,
    linePath,
    yTop: yFor(yMax),
    yBottom: yFor(yMin),
    yMaxValue: maxWeight,
    yMinValue: minWeight,
  };
}

function WeightChart({
  entries,
  accentColor,
  labels,
}: {
  entries: WeightEntry[];
  accentColor: string;
  labels: PdfLabels;
}) {
  const geo = buildWeightChartGeometry(entries);
  if (!geo) {
    return <Text style={styles.muted}>{labels.weightChartNotEnoughData}</Text>;
  }
  const { points, coords, linePath, yTop, yBottom, yMaxValue, yMinValue } = geo;
  // A PDF page can't offer the on-screen chart's hover tooltip, so the value
  // has to be readable straight off the page: two axis labels for the
  // overall range, plus a label per point when there aren't too many of
  // them to stay legible.
  const showPointLabels = points.length <= 8;

  return (
    <View>
      <View style={{ position: "relative", width: CHART_WIDTH, height: CHART_HEIGHT }}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
          <Line x1={CHART_PAD_X} x2={CHART_WIDTH - CHART_PAD_X} y1={yTop} y2={yTop} stroke="#e5e7eb" strokeWidth={1} />
          <Line
            x1={CHART_PAD_X}
            x2={CHART_WIDTH - CHART_PAD_X}
            y1={yBottom}
            y2={yBottom}
            stroke="#e5e7eb"
            strokeWidth={1}
          />
          <Path
            d={linePath}
            stroke={accentColor}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {coords.map((c) => (
            <Fragment key={c.entry.id}>
              <Circle cx={c.x} cy={c.y} r={4} fill="#ffffff" />
              <Circle cx={c.x} cy={c.y} r={2.5} fill={accentColor} />
            </Fragment>
          ))}
        </Svg>

        {/* Value labels as regular (non-SVG) Text, absolutely positioned over
            the chart — SVG Text's style only accepts SVG presentation
            attributes, not fontSize, so plain Text is simpler and safer. */}
        <Text style={[styles.chartAxisLabel, { top: yTop - 10, left: CHART_PAD_X }]}>
          {yMaxValue.toFixed(1)} kg
        </Text>
        <Text style={[styles.chartAxisLabel, { top: yBottom + 3, left: CHART_PAD_X }]}>
          {yMinValue.toFixed(1)} kg
        </Text>
        {showPointLabels &&
          coords.map((c) => (
            <Text
              key={c.entry.id}
              style={[styles.chartPointLabel, { top: c.y - 15, left: c.x - 15 }]}
            >
              {c.entry.weightKg}
            </Text>
          ))}
      </View>

      <View style={styles.row}>
        <Text style={styles.muted}>{fmtDate(points[0].recordedAt)}</Text>
        <Text style={styles.muted}>{fmtDate(points[points.length - 1].recordedAt)}</Text>
      </View>
    </View>
  );
}

export default function PlayerProgressionPdf({
  data,
  labels,
  accentColor,
  generatedAt,
}: {
  data: ProgressionReportData;
  labels: PdfLabels;
  accentColor: string;
  generatedAt: Date;
}) {
  const ph = data.physical;
  const st = data.seasonTotals;
  const weightSinceLast =
    ph.currentWeight != null && ph.previousWeight != null ? ph.currentWeight - ph.previousWeight : null;
  const weightSinceStart =
    ph.currentWeight != null && ph.firstWeight != null ? ph.currentWeight - ph.firstWeight : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image, not an <img> */}
        {data.clubLogoUrl && <Image src={data.clubLogoUrl} style={styles.watermark} fixed />}

        <View style={[styles.header, { borderBottomColor: accentColor }]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image, not an <img> */}
          {data.photoUrl && <Image src={data.photoUrl} style={styles.photo} />}
          <View style={styles.headerText}>
            <Text style={styles.playerName}>{data.playerName}</Text>
            {data.clubName && <Text style={styles.clubLine}>{data.clubName}</Text>}
          </View>
          <View>
            <Text style={styles.reportTitle}>{labels.title}</Text>
            <Text style={styles.generatedOn}>
              {labels.generatedOn} {generatedAt.toLocaleDateString()}
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { color: accentColor, borderBottomColor: accentColor }]}>
              {labels.performanceTitle}
            </Text>
            <Row label={labels.appearances} value={String(st.appearances ?? "-")} alt />
            <Row label={labels.minutes} value={String(st.minutes ?? "-")} />
            <Row label={labels.rating} value={st.rating != null ? st.rating.toFixed(1) : "-"} alt />
            <Row label={labels.goalsOrSaves} value={String(st.goalsOrSaves ?? "-")} />
            <Row label={labels.assistsOrConceded} value={String(st.assistsOrConceded ?? "-")} alt />
          </View>

          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { color: accentColor, borderBottomColor: accentColor }]}>
              {labels.physicalTitle}
            </Text>
            <Row label={labels.height} value={ph.heightCm != null ? `${ph.heightCm} cm` : "-"} alt />

            <View style={styles.weightBlock}>
              <Text style={styles.label}>{labels.weight}</Text>
              <Text style={[styles.bigValue, { color: accentColor }]}>
                {ph.currentWeight != null ? `${ph.currentWeight} kg` : "-"}
              </Text>
              {weightSinceLast != null && (
                <Text style={styles.muted}>
                  {labels.sinceLast}
                  {fmtDelta(weightSinceLast)}
                </Text>
              )}
            </View>

            {weightSinceStart != null && (
              <Row label={labels.sinceStart} value={fmtDelta(weightSinceStart).trim() || "0"} alt />
            )}
          </View>

          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { color: accentColor, borderBottomColor: accentColor }]}>
              {labels.trackingTitle}
            </Text>
            <Row label={labels.notes} value={String(data.tracking.notesCount)} alt />
            <Row label={labels.videos} value={String(data.tracking.videosCount)} />
            {data.tracking.videosByCategory.map((c, i) => (
              <Row key={c.category} label={`  ${c.label}`} value={String(c.count)} alt={i % 2 === 1} />
            ))}
          </View>

          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { color: accentColor, borderBottomColor: accentColor }]}>
              {labels.availabilityTitle}
            </Text>
            <Row label={labels.status} value={labels.statusValue} alt />
            <Row label={labels.injuries} value={String(data.availability.injuryCount)} />
          </View>
        </View>

        <View style={styles.fullSection}>
          <Text style={[styles.sectionTitle, { color: accentColor, borderBottomColor: accentColor }]}>
            {labels.weightChartTitle}
          </Text>
          <WeightChart entries={data.weightEntries} accentColor={accentColor} labels={labels} />
        </View>

        <View style={styles.fullSection}>
          <Text style={[styles.sectionTitle, { color: accentColor, borderBottomColor: accentColor }]}>
            {labels.notes}
          </Text>
          {data.notes.length === 0 ? (
            <Text style={styles.muted}>{labels.notesEmpty}</Text>
          ) : (
            data.notes.map((n, i) => (
              <View key={i} style={[styles.card2, { borderLeftWidth: 3, borderLeftColor: accentColor }]}>
                <Text style={styles.cardDate}>{fmtDate(n.date)}</Text>
                <Text style={styles.cardBody}>{n.content}</Text>
              </View>
            ))
          )}
        </View>

        {data.videos.length > 0 && (
          <View style={styles.fullSection}>
            <Text style={[styles.sectionTitle, { color: accentColor, borderBottomColor: accentColor }]}>
              {labels.videos}
            </Text>
            {data.videos.map((v, i) => (
              <View key={i} style={[styles.card2, { borderLeftWidth: 3, borderLeftColor: accentColor }]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardDate}>{fmtDate(v.date)}</Text>
                  {v.categoryLabel && (
                    <Text style={[styles.cardBadge, { backgroundColor: accentColor }]}>{v.categoryLabel}</Text>
                  )}
                </View>
                <Link src={v.url} style={[styles.cardLink, { color: accentColor }]}>
                  {v.url}
                </Link>
                {v.notes && <Text style={[styles.cardBody, { marginTop: 3 }]}>{v.notes}</Text>}
              </View>
            ))}
          </View>
        )}

        <View style={styles.fullSection}>
          <Text style={[styles.sectionTitle, { color: accentColor, borderBottomColor: accentColor }]}>
            {labels.injuries}
          </Text>
          {data.injuries.length === 0 ? (
            <Text style={styles.muted}>{labels.injuriesEmpty}</Text>
          ) : (
            data.injuries.map((inj, i) => (
              <View key={i} style={[styles.card2, { borderLeftWidth: 3, borderLeftColor: "#f59e0b" }]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardBody}>{inj.description}</Text>
                  <Text style={styles.cardBadge2}>
                    {inj.durationDays != null
                      ? labels.durationDaysLabel(inj.durationDays)
                      : labels.injuryOngoing}
                  </Text>
                </View>
                <Text style={styles.cardDate}>
                  {fmtDate(inj.start)}
                  {inj.end
                    ? ` – ${fmtDate(inj.end)}`
                    : inj.expectedReturnAt
                      ? ` · ${labels.injuryExpectedReturnLabel} ${fmtDate(inj.expectedReturnAt)}`
                      : ""}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text>{labels.footerNote}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `${data.playerName} · ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
