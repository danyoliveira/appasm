import { Fragment } from "react";
import { Document, Page, View, Text, Svg, Rect, Circle, Line, Path, Link, StyleSheet } from "@react-pdf/renderer";
import type { TacticalSnapshotRow } from "./TacticalSnapshotList";
import type { PreparationVideoRow } from "./PreparationVideoList";
import type { TeamColors } from "./useTeamColors";
import type { GameSubmoment, VideoCategory } from "./videoCategories";
import type { Team } from "./TacticalBoard";

// Same reasoning as PlayerProgressionPdf: react-pdf renders this tree
// outside the app's React context (via pdf(<.../>), not mounted in the
// page), so every string arrives pre-translated instead of calling
// useTranslations() in here.
export interface PreGamePdfLabels {
  title: string;
  generatedOn: string;
  tacticalSectionTitle: string;
  videoSectionTitle: string;
  ourTeamLabel: string;
  opponentLabel: string;
  categoryLabels: Record<VideoCategory, string>;
  submomentLabels: Record<GameSubmoment, string>;
  noTacticalSnapshots: string;
  noVideos: string;
  videoPlayerPrefix: string;
  videoTagLabel: string;
  footerNote: string;
}

export interface PreGameReportData {
  ourTeamName: string;
  opponentName: string;
  tacticalRows: TacticalSnapshotRow[];
  videoRows: PreparationVideoRow[];
}

const PITCH_W = 210;
const PITCH_H = Math.round((PITCH_W * 4) / 3);

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 56, fontSize: 10, fontFamily: "Helvetica", color: "#1f2937" },
  header: { marginBottom: 18, paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: "#1f2937" },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 18, fontWeight: 700 },
  subtitle: { fontSize: 11, color: "#4b5563", marginTop: 2 },
  generatedOn: { fontSize: 8, color: "#6b7280", textAlign: "right", marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  teamTitle: { fontSize: 10, fontWeight: 700, marginTop: 10, marginBottom: 6 },
  muted: { fontSize: 9, color: "#6b7280" },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6, padding: 10, marginBottom: 10 },
  cardRow: { flexDirection: "row", gap: 12 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 10, fontWeight: 700, marginBottom: 4 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  badge: {
    fontSize: 8,
    fontWeight: 700,
    color: "#ffffff",
    backgroundColor: "#4f46e5",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 3,
  },
  badgeMuted: {
    fontSize: 8,
    fontWeight: 700,
    color: "#374151",
    backgroundColor: "#f3f4f6",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 3,
  },
  notes: { fontSize: 9, marginTop: 4, lineHeight: 1.4 },
  link: { fontSize: 8, color: "#2563eb", textDecoration: "underline", marginTop: 4 },
  videoTag: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 3,
    backgroundColor: "#fee2e2",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 3,
  },
  videoTagText: { fontSize: 8, fontWeight: 700, color: "#b91c1c" },
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

// Same read-only pitch as StaticTacticalPitch, rebuilt with react-pdf's own
// Svg primitives (that HTML/CSS version can't render inside a PDF), mapping
// every stored 0-100 x/y straight onto a fixed pixel canvas instead of the
// on-page version's viewBox-vs-CSS-percent split (unnecessary once we own
// both axes ourselves).
function PdfTacticalPitch({ row, teamColors }: { row: TacticalSnapshotRow; teamColors: TeamColors }) {
  const w = PITCH_W;
  const h = PITCH_H;
  const x = (pct: number) => (pct / 100) * w;
  const y = (pct: number) => (pct / 100) * h;
  const tokenR = 8;

  return (
    <View style={{ position: "relative", width: w, height: h }}>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Rect x={0} y={0} width={w} height={h} fill="#2f7d32" />
        <Rect
          x={x(4)}
          y={y(3)}
          width={w - x(8)}
          height={h - y(6)}
          stroke="#ffffff"
          strokeOpacity={0.35}
          strokeWidth={1}
          fill="none"
        />
        <Line x1={x(4)} y1={h / 2} x2={w - x(4)} y2={h / 2} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1} />
        <Circle cx={w / 2} cy={h / 2} r={x(11)} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1} fill="none" />
        <Circle cx={w / 2} cy={h / 2} r={1.4} fill="#ffffff" fillOpacity={0.6} />
        <Rect
          x={x(23)}
          y={y(3)}
          width={x(54)}
          height={y(14)}
          stroke="#ffffff"
          strokeOpacity={0.4}
          strokeWidth={1}
          fill="none"
        />
        <Rect
          x={x(23)}
          y={h - y(3) - y(14)}
          width={x(54)}
          height={y(14)}
          stroke="#ffffff"
          strokeOpacity={0.4}
          strokeWidth={1}
          fill="none"
        />

        {row.arrows.map((a) => {
          const x1 = x(a.x1);
          const y1 = y(a.y1);
          const x2 = x(a.x2);
          const y2 = y(a.y2);
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLen = 6;
          return (
            <Fragment key={a.id}>
              <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeWidth={1.4} />
              {a.style !== "line" && (
                <Path
                  d={`M${x2},${y2} L${x2 - headLen * Math.cos(angle - 0.45)},${y2 - headLen * Math.sin(angle - 0.45)} L${x2 - headLen * Math.cos(angle + 0.45)},${y2 - headLen * Math.sin(angle + 0.45)} Z`}
                  fill="#ffffff"
                />
              )}
            </Fragment>
          );
        })}

        {row.markers.map((m) => (
          <Circle key={m.id} cx={x(m.x)} cy={y(m.y)} r={6} fill="#7c3aed" stroke="#ffffff" strokeWidth={1} />
        ))}

        {row.ball && <Circle cx={x(row.ball.x)} cy={y(row.ball.y)} r={4} fill="#ffffff" stroke="#111827" strokeWidth={1} />}

        {row.positions.map((pos) => (
          <Circle
            key={pos.playerId}
            cx={x(pos.x)}
            cy={y(pos.y)}
            r={tokenR}
            fill={pos.team === "us" ? teamColors.usColor : teamColors.opponentColor}
          />
        ))}
      </Svg>

      {/* Player number/name labels as plain (non-SVG) Text, overlaid — same
          reasoning as PlayerProgressionPdf's chart labels: SVG Text only
          accepts SVG presentation attributes, not fontSize/fontWeight. */}
      {row.positions.map((pos) => (
        <Fragment key={pos.playerId}>
          <Text
            style={{
              position: "absolute",
              left: x(pos.x) - tokenR,
              top: y(pos.y) - 4,
              width: tokenR * 2,
              fontSize: 7,
              fontWeight: 700,
              textAlign: "center",
              color: pos.team === "us" ? teamColors.usTextColor : teamColors.opponentTextColor,
            }}
          >
            {pos.number ?? "-"}
          </Text>
          <Text
            style={{
              position: "absolute",
              left: x(pos.x) - 24,
              top: y(pos.y) + tokenR + 1,
              width: 48,
              fontSize: 6,
              textAlign: "center",
              color: "#ffffff",
              backgroundColor: "rgba(0,0,0,0.55)",
              borderRadius: 2,
              paddingVertical: 1,
            }}
          >
            {pos.name}
          </Text>
        </Fragment>
      ))}
    </View>
  );
}

// A real embed isn't possible in a static PDF — a small clickable tag
// (a play-triangle icon + "Vídeo") is enough to flag that this snapshot/row
// has a video and let the reader open it, without spending the space a
// thumbnail needs.
function VideoTag({ url, label }: { url: string; label: string }) {
  return (
    <Link src={url} style={styles.videoTag}>
      <Svg width={6} height={7} viewBox="0 0 6 7">
        <Path d="M0,0 L6,3.5 L0,7 Z" fill="#b91c1c" />
      </Svg>
      <Text style={styles.videoTagText}>{label}</Text>
    </Link>
  );
}

function MomentBadges({
  moment,
  submoment,
  videoUrl,
  labels,
}: {
  moment: VideoCategory | null;
  submoment: GameSubmoment | null;
  // Shown alongside the category/sub-moment tags instead of on its own
  // line, so a card reads as one row of tags ("Defesa | Pressão alta |
  // Vídeo") rather than the video getting visually separated from the rest.
  videoUrl?: string | null;
  labels: PreGamePdfLabels;
}) {
  if (!moment && !submoment && !videoUrl) return null;
  return (
    <View style={styles.badgeRow}>
      {moment && <Text style={styles.badge}>{labels.categoryLabels[moment]}</Text>}
      {submoment && <Text style={styles.badgeMuted}>{labels.submomentLabels[submoment]}</Text>}
      {videoUrl && <VideoTag url={videoUrl} label={labels.videoTagLabel} />}
    </View>
  );
}

function TacticalTeamSection({
  team,
  teamLabel,
  rows,
  teamColors,
  labels,
}: {
  team: Team;
  teamLabel: string;
  rows: TacticalSnapshotRow[];
  teamColors: TeamColors;
  labels: PreGamePdfLabels;
}) {
  const teamRows = rows.filter((r) => r.team === team);

  function renderCard(row: TacticalSnapshotRow) {
    return (
      <View key={row.id} style={styles.card} wrap={false}>
        <View style={styles.cardRow}>
          <PdfTacticalPitch row={row} teamColors={teamColors} />
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{row.title}</Text>
            <MomentBadges moment={row.moment} submoment={row.submoment} videoUrl={row.videoUrl} labels={labels} />
            {row.notes && <Text style={styles.notes}>{row.notes}</Text>}
          </View>
        </View>
      </View>
    );
  }

  if (teamRows.length === 0) {
    return (
      <View>
        <Text style={styles.teamTitle}>{teamLabel}</Text>
        <Text style={styles.muted}>{labels.noTacticalSnapshots}</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Header stays glued to at least the first card — otherwise a page
          break can strand "Adversário" alone at the bottom of a page with
          every one of its snapshots starting fresh on the next. */}
      <View wrap={false}>
        <Text style={styles.teamTitle}>{teamLabel}</Text>
        {renderCard(teamRows[0])}
      </View>
      {teamRows.slice(1).map(renderCard)}
    </View>
  );
}

function VideoTeamSection({
  team,
  teamLabel,
  rows,
  labels,
}: {
  team: Team;
  teamLabel: string;
  rows: PreparationVideoRow[];
  labels: PreGamePdfLabels;
}) {
  const teamRows = rows.filter((r) => r.team === team);

  function renderCard(row: PreparationVideoRow) {
    return (
      <View key={row.id} style={styles.card} wrap={false}>
        <MomentBadges moment={row.category} submoment={row.submoment} videoUrl={row.url} labels={labels} />
        {row.player && (
          <Text style={styles.muted}>
            {labels.videoPlayerPrefix} {row.player.name}
          </Text>
        )}
        {row.notes && <Text style={styles.notes}>{row.notes}</Text>}
      </View>
    );
  }

  if (teamRows.length === 0) {
    return (
      <View>
        <Text style={styles.teamTitle}>{teamLabel}</Text>
        <Text style={styles.muted}>{labels.noVideos}</Text>
      </View>
    );
  }

  return (
    <View>
      <View wrap={false}>
        <Text style={styles.teamTitle}>{teamLabel}</Text>
        {renderCard(teamRows[0])}
      </View>
      {teamRows.slice(1).map(renderCard)}
    </View>
  );
}

export default function PreGamePdf({
  data,
  labels,
  teamColors,
  generatedAt,
}: {
  data: PreGameReportData;
  labels: PreGamePdfLabels;
  teamColors: TeamColors;
  generatedAt: Date;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={[styles.header, { borderBottomColor: teamColors.usColor }]}>
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.title}>
                {data.ourTeamName} vs {data.opponentName}
              </Text>
              <Text style={styles.subtitle}>{labels.title}</Text>
            </View>
            <Text style={styles.generatedOn}>
              {labels.generatedOn} {generatedAt.toLocaleDateString()}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: teamColors.usColor, borderBottomColor: teamColors.usColor }]}>
          {labels.tacticalSectionTitle}
        </Text>
        <TacticalTeamSection
          team="us"
          teamLabel={labels.ourTeamLabel}
          rows={data.tacticalRows}
          teamColors={teamColors}
          labels={labels}
        />
        <TacticalTeamSection
          team="opponent"
          teamLabel={labels.opponentLabel}
          rows={data.tacticalRows}
          teamColors={teamColors}
          labels={labels}
        />

        <Text style={[styles.sectionTitle, { color: teamColors.usColor, borderBottomColor: teamColors.usColor }]}>
          {labels.videoSectionTitle}
        </Text>
        <VideoTeamSection team="us" teamLabel={labels.ourTeamLabel} rows={data.videoRows} labels={labels} />
        <VideoTeamSection team="opponent" teamLabel={labels.opponentLabel} rows={data.videoRows} labels={labels} />

        <View style={styles.footer} fixed>
          <Text>{labels.footerNote}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
