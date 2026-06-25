// ============================================
// SESSION DATABASE
// Session history stored in Firebase
// ============================================

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Session } from "../types";

const SESSIONS_COLLECTION = "sessions";

// ============================================
// GET RECENT SESSIONS
// Returns last N sessions ordered by date
// ============================================

export async function getRecentSessions(
  count: number = 10
): Promise<Session[]> {
  try {
    const q = query(
      collection(db, SESSIONS_COLLECTION),
      orderBy("createdAt", "desc"),
      limit(count)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as Session);
  } catch (error) {
    console.error("Error getting sessions:", error);
    return [];
  }
}

// ============================================
// SAVE SESSION
// Creates or updates a session
// Called periodically during active session
// and when session ends
// ============================================

export async function saveSession(session: Session): Promise<void> {
  try {
    await setDoc(
      doc(db, SESSIONS_COLLECTION, session.id),
      session
    );
  } catch (error) {
    console.error("Error saving session:", error);
  }
}

// ============================================
// UPDATE SESSION
// Partial update for session fields
// ============================================

export async function updateSession(
  sessionId: string,
  updates: Partial<Session>
): Promise<void> {
  try {
    await updateDoc(
      doc(db, SESSIONS_COLLECTION, sessionId),
      updates as Record<string, unknown>
    );
  } catch (error) {
    console.error("Error updating session:", error);
  }
}