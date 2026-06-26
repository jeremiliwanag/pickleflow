// ============================================
// PLAYER DATABASE
// Permanent player roster stored in Firebase
// ============================================

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Player } from "../types";

const PLAYERS_COLLECTION = "players";

// ============================================
// SUBSCRIBE TO ROSTER (real-time)
// Calls onChange whenever the roster changes
// in Firestore -- on any device.
// Returns an unsubscribe function.
// ============================================

export function subscribeToPlayers(
  onChange: (players: Player[]) => void
): Unsubscribe {
  const q = query(collection(db, PLAYERS_COLLECTION), orderBy("name"));
  return onSnapshot(q, (snapshot) => {
    const players = snapshot.docs.map((d) => d.data() as Player);
    onChange(players);
  });
}

// ============================================
// GET ALL PLAYERS (one-time, kept for compat)
// ============================================

export async function getAllPlayers(): Promise<Player[]> {
  try {
    const q = query(collection(db, PLAYERS_COLLECTION), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as Player);
  } catch (error) {
    console.error("Error getting players:", error);
    return [];
  }
}

// ============================================
// SAVE PLAYER
// ============================================

export async function savePlayer(player: Player): Promise<void> {
  try {
    await setDoc(doc(db, PLAYERS_COLLECTION, player.id), player);
  } catch (error) {
    console.error("Error saving player:", error);
  }
}

// ============================================
// UPDATE PLAYER
// ============================================

export async function updatePlayer(
  playerId: string,
  updates: Partial<Player>
): Promise<void> {
  try {
    await updateDoc(
      doc(db, PLAYERS_COLLECTION, playerId),
      updates as Record<string, unknown>
    );
  } catch (error) {
    console.error("Error updating player:", error);
  }
}

// ============================================
// DELETE PLAYER
// ============================================

export async function deletePlayer(playerId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, PLAYERS_COLLECTION, playerId));
  } catch (error) {
    console.error("Error deleting player:", error);
  }
}
