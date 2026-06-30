// Firebase setup for JCSO Quest
// Project: docjt-kahoot
// I added databaseURL because the JCSO Quest live join feature uses Realtime Database.
// If Firebase Console shows a different Realtime Database URL, replace only databaseURL below.

export const firebaseConfig = {
  apiKey: "AIzaSyDvDrx5r_TJLWJZ6c7_7_oyApQu8IlVpiI",
  authDomain: "docjt-kahoot.firebaseapp.com",
  databaseURL: "https://docjt-kahoot-default-rtdb.firebaseio.com",
  projectId: "docjt-kahoot",
  storageBucket: "docjt-kahoot.firebasestorage.app",
  messagingSenderId: "856862963214",
  appId: "1:856862963214:web:66107aafb39b3824452e5f",
  measurementId: "G-Z368CRXVDZ"
};

export const GAME_ROOT = "docjt_live_games";
