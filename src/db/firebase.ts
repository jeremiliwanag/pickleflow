import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBHYti09OP7M987lJVUG6hRtp_KNZEVo9w",
  authDomain: "pickeflow.firebaseapp.com",
  projectId: "pickeflow",
  storageBucket: "pickeflow.firebasestorage.app",
  messagingSenderId: "54334498635",
  appId: "1:54334498635:web:6c47db1d49e159641ceace",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);