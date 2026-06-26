import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";
import type { PlayerSessionRecord, Session } from "../types";

const HISTORY_COLLECTION = "playerHistory";

export async function saveSessionHistory(session: Session): Promise<void> {
  const records: PlayerSessionRecord[] = session.players
    .filter((p) => p.gamesPlayed > 0)
    .map((p) => ({
      id: `${p.id}_${session.id}`,
      playerId: p.id,
      sessionId: session.id,
      sessionName: session.name,
      date: session.endedAt ?? Date.now(),
      gamesPlayed: p.gamesPlayed,
      gamesWon: p.gamesWon,
      winRate:
        p.gamesPlayed > 0
          ? Math.round((p.gamesWon / p.gamesPlayed) * 100)
          : 0,
      peakWinStreak: p.winStreak ?? 0,
    }));

  await Promise.all(
    records.map((record) =>
      setDoc(doc(db, HISTORY_COLLECTION, record.id), record)
    )
  );
}

export async function getPlayerHistory(
  playerId: string
): Promise<PlayerSessionRecord[]> {
  const q = query(
    collection(db, HISTORY_COLLECTION),
    where("playerId", "==", playerId),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as PlayerSessionRecord);
}
