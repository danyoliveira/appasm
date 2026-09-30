import { Fragment } from "react";
import { Document, Page, View, Text, Svg, Rect, Circle, Line, StyleSheet } from "@react-pdf/renderer";
import { PDF_FONT } from "@/lib/pdfFonts";

// Rendered by react-pdf outside the app's React tree, so every string and
// every number arrives ready-made (translated labels, tallied stats) — this
// file only lays them out.
export interface PostGamePdfData {
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  matchDate: string | null;
  competition: string | null;
  homeColor: string;
  homeTextColor: string;
  awayColor: string;
  awayTextColor: string;
  scorers: { home: string[]; away: string[] };
  notes: string | null;
  events: { minute: string; label: string; detail: string; team: string }[];
  lineups: {
    home: { starters: PitchPlayer[]; substitutes: string[] };
    away: { starters: PitchPlayer[]; substitutes: string[] };
  };
  // null when possession was never tracked.
  possession: { home: number; away: number } | null;
  collective: { label: string; home: number; away: number }[];
  goalkeepers: {
    name: string;
    groups: { label: string; rows: { label: string; complete: number; incomplete: number; pct: string }[] }[];
  }[];
}

export interface PitchPlayer {
  name: string;
  number: number | null;
  x: number;
  y: number;
}

export interface PostGamePdfLabels {
  title: string;
  generatedOn: string;
  matchDateLabel: string;
  notesTitle: string;
  eventsTitle: string;
  formationTitle: string;
  substitutesLabel: string;
  collectiveTitle: string;
  possessionLabel: string;
  gkTitle: string;
  noEvents: string;
  footerNote: string;
}

const PITCH_W = 186;
const PITCH_H = Math.round((PITCH_W * 4) / 3);

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 56, fontSize: 10, fontFamily: PDF_FONT, color: "#1f2937" },
  strip: { flexDirection: "row", height: 4, marginBottom: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  subtitle: { fontSize: 11, color: "#4b5563" },
  meta: { fontSize: 9, color: "#6b7280", marginTop: 3 },
  generatedOn: { fontSize: 8, color: "#6b7280", textAlign: "right" },
  scoreRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", marginTop: 14 },
  scoreTeam: { flex: 1 },
  teamName: { fontSize: 15, fontWeight: 700 },
  scorer: { fontSize: 8.5, color: "#4b5563", marginTop: 2 },
  score: { fontSize: 30, fontWeight: 700, marginHorizontal: 18, lineHeight: 1 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginTop: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginTop: 16,
    marginBottom: 7,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  notes: { fontSize: 9.5, lineHeight: 1.5 },
  muted: { fontSize: 9, color: "#6b7280" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  tableHead: { fontSize: 8, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" },
  cellMinute: { width: 34, fontSize: 9, color: "#6b7280" },
  cellLabel: { width: 110, fontSize: 9, fontWeight: 700 },
  cellDetail: { flex: 1, fontSize: 9 },
  cellTeam: { width: 110, fontSize: 9, color: "#6b7280", textAlign: "right" },
  statLabel: { flex: 1, fontSize: 9 },
  statValue: { width: 70, fontSize: 9.5, fontWeight: 700, textAlign: "center" },
  pitches: { flexDirection: "row", justifyContent: "space-around" },
  pitchCol: { width: PITCH_W },
  pitchTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  pitchTitle: { fontSize: 10, fontWeight: 700 },
  subsLabel: { fontSize: 7.5, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginTop: 6 },
  subs: { fontSize: 8, color: "#374151", marginTop: 2, lineHeight: 1.4 },
  gkName: { fontSize: 10.5, fontWeight: 700, marginBottom: 4 },
  gkGroups: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  gkGroup: { width: "48.5%", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 5, padding: 8, marginBottom: 8 },
  gkGroupTitle: { fontSize: 9, fontWeight: 700, marginBottom: 3 },
  gkCell: { width: 30, fontSize: 9, textAlign: "center" },
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

function Pitch({ players, color, textColor }: { players: PitchPlayer[]; color: string; textColor: string }) {
  const w = PITCH_W;
  const h = PITCH_H;
  const x = (pct: number) => (pct / 100) * w;
  const y = (pct: number) => (pct / 100) * h;
  const r = 8;
  const line = { stroke: "#ffffff", strokeOpacity: 0.35, strokeWidth: 1, fill: "none" } as const;
  return (
    <View style={{ position: "relative", width: w, height: h }}>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Rect x={0} y={0} width={w} height={h} fill="#2f7d32" />
        <Rect x={x(4)} y={y(3)} width={w - x(8)} height={h - y(6)} {...line} />
        <Line x1={x(4)} y1={h / 2} x2={w - x(4)} y2={h / 2} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1} />
        <Circle cx={w / 2} cy={h / 2} r={x(11)} {...line} />
        <Rect x={x(23)} y={y(3)} width={x(54)} height={y(14)} {...line} />
        <Rect x={x(23)} y={h - y(3) - y(14)} width={x(54)} height={y(14)} {...line} />
        {players.map((p, i) => (
          <Circle key={i} cx={x(p.x)} cy={y(p.y)} r={r} fill={color} stroke="#ffffff" strokeOpacity={0.5} strokeWidth={0.8} />
        ))}
      </Svg>
      {/* Direct children of the pitch box (a Fragment, not a View) so their
          absolute offsets are measured from the pitch itself. */}
      {players.map((p, i) => (
        <Fragment key={i}>
          <Text
            style={{
              position: "absolute",
              left: x(p.x) - r,
              top: y(p.y) - 3.8,
              width: r * 2,
              fontSize: 6.5,
              fontWeight: 700,
              textAlign: "center",
              color: textColor,
            }}
          >
            {p.number ?? "-"}
          </Text>
          <Text
            style={{
              position: "absolute",
              left: x(p.x) - 22,
              top: y(p.y) + r + 1,
              width: 44,
              fontSize: 5.5,
              textAlign: "center",
              color: "#ffffff",
              backgroundColor: "rgba(0,0,0,0.55)",
              borderRadius: 2,
              paddingVertical: 1,
            }}
          >
            {p.name}
          </Text>
        </Fragment>
      ))}
    </View>
  );
}

export default function PostGamePdf({
  data,
  labels,
  generatedAt,
  locale,
}: {
  data: PostGamePdfData;
  labels: PostGamePdfLabels;
  generatedAt: Date;
  locale: string;
}) {
  const matchDate = data.matchDate
    ? new Date(data.matchDate).toLocaleString(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const sides = [
    { key: "home" as const, name: data.homeName, color: data.homeColor, text: data.homeTextColor },
    { key: "away" as const, name: data.awayName, color: data.awayColor, text: data.awayTextColor },
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.strip}>
          <View style={{ flex: 1, backgroundColor: data.homeColor }} />
          <View style={{ flex: 1, backgroundColor: data.awayColor }} />
        </View>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.subtitle}>{labels.title}</Text>
            {(data.competition || matchDate) && (
              <Text style={styles.meta}>
                {[data.competition, matchDate ? `${labels.matchDateLabel}: ${matchDate}` : null]
                  .filter(Boolean)
                  .join("  ·  ")}
              </Text>
            )}
          </View>
          <Text style={styles.generatedOn}>
            {labels.generatedOn} {generatedAt.toLocaleDateString(locale)}
          </Text>
        </View>

        <View style={styles.scoreRow}>
          <View style={[styles.scoreTeam, { alignItems: "flex-end" }]}>
            <Text style={styles.teamName}>{data.homeName}</Text>
            {data.scorers.home.map((s, i) => (
              <Text key={i} style={styles.scorer}>
                {s}
              </Text>
            ))}
          </View>
          <Text style={styles.score}>
            {data.homeScore} – {data.awayScore}
          </Text>
          <View style={styles.scoreTeam}>
            <Text style={styles.teamName}>{data.awayName}</Text>
            {data.scorers.away.map((s, i) => (
              <Text key={i} style={styles.scorer}>
                {s}
              </Text>
            ))}
          </View>
        </View>
        <View style={styles.divider} />

        {data.notes && (
          <View>
            <Text minPresenceAhead={60} style={styles.sectionTitle}>
              {labels.notesTitle}
            </Text>
            <Text style={styles.notes}>{data.notes}</Text>
          </View>
        )}

        <Text minPresenceAhead={60} style={styles.sectionTitle}>
          {labels.eventsTitle}
        </Text>
        {data.events.length === 0 ? (
          <Text style={styles.muted}>{labels.noEvents}</Text>
        ) : (
          data.events.map((e, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={styles.cellMinute}>{e.minute}</Text>
              <Text style={styles.cellLabel}>{e.label}</Text>
              <Text style={styles.cellDetail}>{e.detail}</Text>
              <Text style={styles.cellTeam}>{e.team}</Text>
            </View>
          ))
        )}

        <View wrap={false}>
          <Text style={styles.sectionTitle}>{labels.formationTitle}</Text>
          <View style={styles.pitches}>
            {sides.map((side) => (
              <View key={side.key} style={styles.pitchCol}>
                <View style={styles.pitchTitleRow}>
                  <View style={[styles.dot, { backgroundColor: side.color }]} />
                  <Text style={styles.pitchTitle}>{side.name}</Text>
                </View>
                <Pitch players={data.lineups[side.key].starters} color={side.color} textColor={side.text} />
                {data.lineups[side.key].substitutes.length > 0 && (
                  <>
                    <Text style={styles.subsLabel}>{labels.substitutesLabel}</Text>
                    <Text style={styles.subs}>{data.lineups[side.key].substitutes.join("   ")}</Text>
                  </>
                )}
              </View>
            ))}
          </View>
        </View>

        {(data.possession || data.collective.length > 0) && (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>{labels.collectiveTitle}</Text>
            <View style={styles.tableRow}>
              <Text style={[styles.statLabel, styles.tableHead]}> </Text>
              <Text style={[styles.statValue, styles.tableHead]}>{data.homeName}</Text>
              <Text style={[styles.statValue, styles.tableHead]}>{data.awayName}</Text>
            </View>
            {data.possession && (
              <View style={styles.tableRow}>
                <Text style={styles.statLabel}>{labels.possessionLabel}</Text>
                <Text style={styles.statValue}>{data.possession.home}%</Text>
                <Text style={styles.statValue}>{data.possession.away}%</Text>
              </View>
            )}
            {data.collective.map((row, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.statLabel}>{row.label}</Text>
                <Text style={styles.statValue}>{row.home}</Text>
                <Text style={styles.statValue}>{row.away}</Text>
              </View>
            ))}
          </View>
        )}

        {data.goalkeepers.length > 0 && (
          <View>
            <Text minPresenceAhead={160} style={styles.sectionTitle}>
              {labels.gkTitle}
            </Text>
            {data.goalkeepers.map((gk, g) => (
              <View key={g} style={{ marginBottom: 6 }} wrap={false}>
                <Text style={styles.gkName}>{gk.name}</Text>
                <View style={styles.gkGroups}>
                  {gk.groups.map((group, i) => (
                    <View key={i} style={styles.gkGroup} wrap={false}>
                      <View style={[styles.tableRow, { borderBottomWidth: 0, paddingVertical: 0 }]}>
                        <Text style={[styles.statLabel, styles.gkGroupTitle]}>{group.label}</Text>
                        <Text style={[styles.gkCell, styles.tableHead, { color: "#15803d" }]}>OK</Text>
                        <Text style={[styles.gkCell, styles.tableHead, { color: "#b91c1c" }]}>X</Text>
                        <Text style={[styles.gkCell, styles.tableHead]}>%</Text>
                      </View>
                      {group.rows.map((row, r) => (
                        <View key={r} style={styles.tableRow}>
                          <Text style={styles.statLabel}>{row.label}</Text>
                          <Text style={styles.gkCell}>{row.complete}</Text>
                          <Text style={styles.gkCell}>{row.incomplete}</Text>
                          <Text style={[styles.gkCell, { color: "#6b7280" }]}>{row.pct}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{labels.footerNote}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
