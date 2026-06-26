import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

export async function uploadPlayerPhoto(
  playerId: string,
  file: File
): Promise<string> {

  const storageRef = ref(storage, `players/${playerId}/photo.jpg`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function getPlayerPhotoURL(
  playerId: string
): Promise<string | null> {
  try {
    const storageRef = ref(storage, `players/${playerId}/photo.jpg`);
    return await getDownloadURL(storageRef);
  } catch {
    return null;
  }
}
