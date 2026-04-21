import { Router } from "express";
import { getElastic } from "../elastic-instance.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const elastic = getElastic();
    const [totalIngested, members, recent] = await Promise.all([
      elastic.countMeetingNotes(),
      elastic.listSyncStates(),
      elastic.recentIngestions(10),
    ]);

    const notesPerMember = Object.fromEntries(
      members.map((m) => [m.user_email, m.total_notes_ingested ?? 0]),
    );

    const weekAgo = Date.now() - 7 * 86400e5;
    const notesThisWeek = recent.filter((n) => {
      const t = n.ingested_at ? new Date(String(n.ingested_at)).getTime() : 0;
      return t >= weekAgo;
    }).length;

    res.json({
      total_notes_ingested: totalIngested,
      notes_this_week_estimate: notesThisWeek,
      team_members_active: members.filter((m) => m.granola_api_key).length,
      notes_per_team_member: notesPerMember,
      recent_ingestions: recent.map((n) => ({
        note_id: n.note_id,
        title: n.title,
        author_email: n.author_email,
        author_name: n.author_name,
        account: n.account,
        ingested_at: n.ingested_at,
        meeting_date: n.meeting_date,
      })),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to load sync status" });
  }
});

export default router;
