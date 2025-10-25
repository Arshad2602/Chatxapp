import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
  push,
  runTransaction,
  remove,
} from "firebase/database";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import {
  FiSettings,
  FiArrowLeft,
  FiChevronRight,
  FiUser,
  FiEdit2,
  FiVideo,
  FiMessageSquare,
  FiMoon,
  FiShield,
  FiLogOut,
  FiTrash2,
} from "react-icons/fi";
import "./App.css";
import ReelsPage from "./ReelsPage";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBwaJj3l9t-eJw2naNJHw0_ZSqkbGZPMug",
  authDomain: "chat-app-fa970.firebaseapp.com",
  databaseURL:
    "https://chat-app-fa970-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chat-app-fa970",
  storageBucket: "chat-app-fa970.appspot.com",
  messagingSenderId: "786186698157",
  appId: "1:786186698157:web:39081a907637f84985f524",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

// Theme presets
const THEME_PRESETS = [
  { name: "Emerald", color: "#10b981" },
  { name: "Indigo", color: "#6366f1" },
  { name: "Rose", color: "#f43f5e" },
  { name: "Amber", color: "#f59e0b" },
  { name: "Teal", color: "#14b8a6" },
  { name: "Violet", color: "#7c3aed" },
];

export default function App() {
  // ------------------- State -------------------
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [uniqueId, setUniqueId] = useState(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [usersMap, setUsersMap] = useState({});
  const [inbox, setInbox] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [settingsPage, setSettingsPage] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showReels, setShowReels] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState(null);
  const [lightboxType, setLightboxType] = useState(null);
  const [lightboxLoading, setLightboxLoading] = useState(true);
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [showDeletePopupId, setShowDeletePopupId] = useState(null);
  const [showChatMenu, setShowChatMenu] = useState(false); // New state for chat menu
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const profilePicInputRef = useRef(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const appRef = useRef(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("app_theme") || "dark"
  );
  const [primaryColor, setPrimaryColor] = useState(
    () => localStorage.getItem("app_primary") || THEME_PRESETS[0].color
  );

  // ------------------- Effects: Auth -------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        console.log("onAuthStateChanged: User UID:", currentUser.uid);
        setUser(currentUser);

        const userRef = ref(db, `users/${currentUser.uid}`);
        const snap = await get(userRef);
        console.log("onAuthStateChanged: User snapshot exists:", snap.exists());

        if (snap.exists()) {
          const val = snap.val();
          console.log("onAuthStateChanged: Database data:", val);
          setUsername(val.username || currentUser.displayName || "User");
          setUniqueId(val.uniqueId);
          await update(userRef, { isOnline: true });
        } else {
          console.log("onAuthStateChanged: No database entry, waiting for signup");
          setUsername(currentUser.displayName || "User");
          setUniqueId(null);
        }
      } else {
        console.log("onAuthStateChanged: No user logged in");
        setUser(null);
        setUniqueId(null);
        setUsername("");
        setSelectedUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Set offline on leaving
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (user) update(ref(db, `users/${user.uid}`), { isOnline: false });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [user]);

  // Load users map
  useEffect(() => {
    const usersRef = ref(db, "users");
    onValue(usersRef, (snapshot) => {
      setUsersMap(snapshot.val() || {});
    });
  }, []);

  // Inbox - Update without redirecting
  useEffect(() => {
    if (!user) return;
    const chatsRef = ref(db, "privateChats");
    const unsubscribe = onValue(chatsRef, (snapshot) => {
      const data = snapshot.val() || {};
      const userChats = [];
      Object.entries(data).forEach(([chatId, msgs]) => {
        const participants = chatId.split("_");
        if (participants.includes(user.uid)) {
          const otherUid = participants.find((uid) => uid !== user.uid);
          const lastMessage = Object.values(msgs).slice(-1)[0];
          userChats.push({ chatId, otherUid, lastMessage });
        }
      });
      userChats.sort(
        (a, b) =>
          new Date(`1970/01/01 ${b.lastMessage?.time}`) -
          new Date(`1970/01/01 ${a.lastMessage?.time}`)
      );
      setInbox(userChats);
    });
    return () => unsubscribe();
  }, [user]);

  // Messages auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load chat messages only for the selected user
  useEffect(() => {
    if (!user || !selectedUser) return;
    const chatId = [user.uid, selectedUser.uid].sort().join("_");
    const chatRef = ref(db, `privateChats/${chatId}`);
    const unsubscribe = onValue(chatRef, (snapshot) => {
      setMessages(snapshot.val() ? Object.values(snapshot.val()) : []);
    });
    return () => unsubscribe();
  }, [selectedUser, user]);

  // Search
  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (!searchQuery.trim() || !user) return setSearchResult(null);

      const usersRef = ref(db, "users");
      const snap = await get(usersRef);
      const usersData = snap.val();
      if (!usersData) return;

      const found = Object.values(usersData).find(
        (u) =>
          (u.username?.toLowerCase() === searchQuery.toLowerCase() ||
            u.uniqueId?.toString() === searchQuery) &&
          u.uid !== user.uid
      );
      setSearchResult(found || null);
    }, 400);

    return () => clearTimeout(timeout);
  }, [searchQuery, user]);

  // Theme application
  useEffect(() => {
    localStorage.setItem("app_theme", theme);
    localStorage.setItem("app_primary", primaryColor);

    const darkVars = {
      "--app-bg": "#0f1724",
      "--card-bg": "#0f1724",
      "--panel-bg": "#111827",
      "--text": "#e5e7eb",
      "--muted": "#9ca3af",
      "--input-bg": "#374151",
      "--input-text": "#ffffff",
    };

    const lightVars = {
      "--app-bg": "#f8fafc",
      "--card-bg": "#ffffff",
      "--panel-bg": "#f1f5f9",
      "--text": "#0f1724",
      "--muted": "#6b7280",
      "--input-bg": "#ffffff",
      "--input-text": "#000000",
    };

    const vars = theme === "dark" ? darkVars : lightVars;

    const root = document.documentElement;
    root.style.setProperty("--primary", primaryColor);
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

    document.body.style.background = "var(--app-bg)";
    document.body.style.color = "var(--text)";
  }, [theme, primaryColor]);

  // ------------------- Auth Actions -------------------
  const handleSignUp = async () => {
    if (!email || !password || !username) return alert("Fill all fields!");
    try {
      console.log("handleSignUp: Starting signup for email:", email);
      const res = await createUserWithEmailAndPassword(auth, email, password);
      console.log("handleSignUp: User created, UID:", res.user.uid);

      await updateProfile(res.user, { displayName: username });
      console.log("handleSignUp: displayName set to:", username);

      const userRef = ref(db, `users/${res.user.uid}`);
      const lastIdRef = ref(db, "lastUniqueId");
      let newId;

      const snap = await get(userRef);
      console.log("handleSignUp: User exists in DB:", snap.exists());
      if (snap.exists()) {
        newId = snap.val().uniqueId;
        console.log("handleSignUp: Using existing uniqueId:", newId);
      } else {
        await runTransaction(lastIdRef, (currentId) => {
          return (currentId || 100000) + 1;
        }).then((result) => {
          newId = result.snapshot.val();
          console.log("handleSignUp: Assigned new uniqueId:", newId);
        });

        await set(userRef, {
          uid: res.user.uid,
          username,
          email,
          uniqueId: newId,
          isOnline: true,
        });
        console.log("handleSignUp: User data set in DB");
      }

      setUniqueId(newId);
      setUsername(username);
      setIsSigningUp(false);
      alert(`Sign Up successful! Your unique ID: ${newId}`);
    } catch (err) {
      console.error("handleSignUp: Error:", err);
      alert(err.message);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return alert("Fill all fields!");
    try {
      console.log("handleLogin: Attempting login for email:", email);
      await signInWithEmailAndPassword(auth, email, password);
      console.log("handleLogin: Login successful");
      setSettingsPage(false);
      setShowProfile(false);
      setShowReels(false);
    } catch (err) {
      console.error("handleLogin: Error:", err);
      alert(err.message);
    }
  };

  const handleLogout = async () => {
    if (user) {
      console.log("handleLogout: Logging out user:", user.uid);
      await update(ref(db, `users/${user.uid}`), { isOnline: false });
    }
    await signOut(auth);
    setUser(null);
    setSelectedUser(null);
    setMessages([]);
    setSearchResult(null);
    setUniqueId(null);
    setUsername("");
    document.body.style.overflow = "auto";
    console.log("handleLogout: Logout complete");
  };

  // ------------------- Profile Actions -------------------
  const handleProfilePicChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;

    try {
      const fileRef = storageRef(storage, `profilePics/${user.uid}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      await updateProfile(user, { photoURL: url });
      await update(ref(db, `users/${user.uid}`), { profilePic: url });
      setUser({ ...user, photoURL: url });
      alert("Profile picture updated!");
    } catch (err) {
      console.error("handleProfilePicChange: Error:", err);
      alert("Failed to update profile picture");
    }
  };

  const handleUsernameChange = async () => {
    if (!newUsername.trim()) return alert("Username cannot be empty!");
    try {
      console.log("handleUsernameChange: Updating username to:", newUsername);
      await updateProfile(user, { displayName: newUsername });
      await update(ref(db, `users/${user.uid}`), { username: newUsername });
      setUsername(newUsername);
      setEditingUsername(false);
      console.log("handleUsernameChange: Username updated successfully");
      alert("Username updated successfully!");
    } catch (err) {
      console.error("handleUsernameChange: Error:", err);
      alert("Failed to update username");
    }
  };

  // ------------------- Chat Actions -------------------
  const startPrivateChat = (otherUser) => {
    setSelectedUser(otherUser);
    setMessages([]);
  };

  const sendMessage = async () => {
    if (!text.trim() || !selectedUser) return;
    const chatId = [user.uid, selectedUser.uid].sort().join("_");
    const chatRef = ref(db, `privateChats/${chatId}`);
    await push(chatRef, {
      senderUid: user.uid,
      senderName: username,
      text,
      time: new Date().toLocaleTimeString(),
      replyTo: replyingTo || null,
    });
    setText("");
    setReplyingTo(null);
  };

  const deleteMessage = async (msgKey) => {
    if (!selectedUser) return;
    const chatId = [user.uid, selectedUser.uid].sort().join("_");
    const msgRef = ref(db, `privateChats/${chatId}/${msgKey}`);
    await remove(msgRef);
    setShowDeletePopupId(null);
  };

  const deleteChat = async () => {
    if (!selectedUser) return;
    if (!window.confirm("Are you sure you want to delete this chat? This action cannot be undone.")) return;

    try {
      const chatId = [user.uid, selectedUser.uid].sort().join("_");
      const chatRef = ref(db, `privateChats/${chatId}`);
      await remove(chatRef);
      setInbox((prev) => prev.filter((chat) => chat.chatId !== chatId));
      setSelectedUser(null);
      setMessages([]);
      setShowChatMenu(false);
      alert("Chat deleted successfully");
    } catch (err) {
      console.error("Error deleting chat:", err);
      alert("Failed to delete chat");
    }
  };

  const deleteAllChats = async () => {
    if (!window.confirm("Are you sure you want to delete all chats? This action cannot be undone.")) return;

    try {
      for (const chat of inbox) {
        const chatRef = ref(db, `privateChats/${chat.chatId}`);
        await remove(chatRef);
      }
      setInbox([]);
      setSelectedUser(null);
      setMessages([]);
      alert("All chats deleted successfully");
    } catch (err) {
      console.error("Error deleting chats:", err);
      alert("Failed to delete some chats");
    }
  };

  const sendFile = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedUser) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const chatId = [user.uid, selectedUser.uid].sort().join("_");
      const chatRef = ref(db, `privateChats/${chatId}`);
      await push(chatRef, {
        senderUid: user.uid,
        senderName: username,
        file: reader.result,
        fileType: file.type.startsWith("image") ? "image" : "video",
        time: new Date().toLocaleTimeString(),
      });
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 200);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ------------------- Utilities -------------------
  const openSettings = () => {
    setSettingsPage(true);
    document.body.style.overflow = "hidden";
  };

  const closeSettings = () => {
    setSettingsPage(false);
    document.body.style.overflow = "auto";
  };

  const toggleTheme = () => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  const chooseColor = (hex) => {
    setPrimaryColor(hex);
  };

  // ------------------- UI -------------------
  if (!user) {
    return (
      <div
        className="flex items-center justify-center h-screen px-2"
        style={{ background: "var(--app-bg)", color: "var(--text)" }}
      >
        <div
          className="p-8 rounded-2xl w-full max-w-[350px] shadow-xl"
          style={{ background: "var(--card-bg)" }}
        >
          {isSigningUp ? (
            <>
              <h1 className="text-2xl font-bold mb-6 text-center">Sign Up</h1>
              <input
                type="text"
                placeholder="Username"
                className="w-full p-3 mb-4 rounded-xl border outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  background: "var(--input-bg)",
                  color: "var(--input-text)",
                  borderColor: theme === "dark" ? "#4b5563" : "#d1d5db",
                }}
              />
              <input
                type="email"
                placeholder="Email"
                className="w-full p-3 mb-4 rounded-xl border outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  background: "var(--input-bg)",
                  color: "var(--input-text)",
                  borderColor: theme === "dark" ? "#4b5563" : "#d1d5db",
                }}
              />
              <input
                type="password"
                placeholder="Password"
                className="w-full p-3 mb-4 rounded-xl border outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  background: "var(--input-bg)",
                  color: "var(--input-text)",
                  borderColor: theme === "dark" ? "#4b5563" : "#d1d5db",
                }}
              />
              <button
                onClick={handleSignUp}
                className="w-full py-3 rounded-xl mb-2"
                style={{ background: "var(--primary)", color: "#fff" }}
              >
                Sign Up
              </button>
              <p className="text-center text-sm">
                Already have an account?{" "}
                <span
                  className="cursor-pointer"
                  style={{ color: "var(--primary)" }}
                  onClick={() => setIsSigningUp(false)}
                >
                  Login
                </span>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
              <input
                type="email"
                placeholder="Email"
                className="w-full p-3 mb-4 rounded-xl border outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  background: "var(--input-bg)",
                  color: "var(--input-text)",
                  borderColor: theme === "dark" ? "#4b5563" : "#d1d5db",
                }}
              />
              <input
                type="password"
                placeholder="Password"
                className="w-full p-3 mb-4 rounded-xl border outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  background: "var(--input-bg)",
                  color: "var(--input-text)",
                  borderColor: theme === "dark" ? "#4b5563" : "#d1d5db",
                }}
              />
              <button
                onClick={handleLogin}
                className="w-full py-3 rounded-xl mb-2"
                style={{ background: "var(--primary)", color: "#fff" }}
              >
                Login
              </button>
              <p className="text-center text-sm">
                Don't have an account?{" "}
                <span
                  className="cursor-pointer"
                  style={{ color: "var(--primary)" }}
                  onClick={() => setIsSigningUp(true)}
                >
                  Sign Up
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Main logged-in UI
  return (
    <div
      className="max-auto flex flex-col items-center justify-start pt-6 px-2 sm:px-0 min-h-screen"
      style={{ background: "var(--app-bg)", color: "var(--text)" }}
    >
      {/* Header */}
      {!selectedUser && !settingsPage && (
        <div className="Hookup relative w-full max-w-[420px] mb-4">
          <div
            className="py-2 font-semibold text-lg rounded-2xl flex justify-between items-center px-4 shadow-md"
            style={{
              background: "var(--panel-bg)",
              color: "var(--text)",
            }}
          >
            <span>💬 Hookapp</span>
            <button
              onClick={openSettings}
              className="p-2 rounded-full hover:bg-gray-700 transition-all group"
              style={{ color: "var(--text)" }}
            >
              <FiSettings
                size={22}
                className="transition-transform duration-500 group-hover:rotate-[180deg]"
                style={{ color: "var(--primary)" }}
              />
            </button>
          </div>
        </div>
      )}

      {/* ⚙️ Settings Page Overlay */}
      {settingsPage && !showProfile && (
        <>
          <style>{`
            body { overflow: hidden !important; }
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          `}</style>

          <div
            className="fixed inset-0 backdrop-blur-lg z-[999999] flex justify-center items-start"
            style={{ background: "rgba(2,6,23,0.95)" }}
          >
            <div
              className="relative w-[420px] h-full rounded-2xl shadow-2xl overflow-y-auto p-5 pt-6 pb-28 no-scrollbar"
              style={{ background: "var(--card-bg)", color: "var(--text)" }}
            >
              <div
                className="text-center text-2xl font-semibold border-b pb-4 flex justify-between items-center sticky top-0 z-20"
                style={{ borderColor: "rgba(148,163,184,0.06)" }}
              >
                <span>⚙️ Settings</span>
                <button
                  onClick={closeSettings}
                  className="text-gray-400 hover:text-white transition-all"
                  style={{ color: "var(--muted)" }}
                >
                  ✕
                </button>
              </div>

              <div
                className="rounded-2xl p-4 space-y-2 mt-4"
                style={{
                  background: theme === "dark" ? "#1F2937" : "var(--panel-bg)",
                  color: theme === "dark" ? "#fff" : "var(--text)",
                }}
              >
                <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
                  Account
                </p>

                <button
                  onClick={() => {
                    setShowProfile(true);
                    setNewUsername(username);
                  }}
                  className="w-full flex justify-between items-center p-3 rounded-xl hover:opacity-95 transition-all"
                  style={{ background: "transparent", color: "var(--text)" }}
                >
                  <div className="flex items-center gap-3">
                    <FiUser size={20} style={{ color: "var(--primary)" }} />
                    <span>Profile</span>
                  </div>
                  <FiChevronRight size={18} style={{ color: "var(--muted)" }} />
                </button>

                <button
                  className="w-full flex justify-between items-center p-3 rounded-xl hover:opacity-95 transition-all"
                  style={{ background: "transparent", color: "var(--text)" }}
                >
                  <div className="flex items-center gap-3">
                    <FiMessageSquare size={20} style={{ color: "var(--primary)" }} />
                    <span>Chat History</span>
                  </div>
                  <FiChevronRight size={18} style={{ color: "var(--muted)" }} />
                </button>

                <button
                  onClick={deleteAllChats}
                  className="w-full flex justify-between items-center p-3 rounded-xl hover:opacity-95 transition-all"
                  style={{ background: "transparent", color: "var(--text)" }}
                >
                  <div className="flex items-center gap-3">
                    <FiTrash2 size={20} style={{ color: "red" }} />
                    <span style={{ color: "red" }}>Delete All Chats</span>
                  </div>
                  <FiChevronRight size={18} style={{ color: "var(--muted)" }} />
                </button>
              </div>

              <div
                className="rounded-2xl p-4 space-y-2 mt-4"
                style={{
                  background: theme === "dark" ? "#1F2937" : "var(--panel-bg)",
                  color: theme === "dark" ? "#fff" : "var(--text)",
                }}
              >
                <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
                  Preferences
                </p>

                <div className="flex items-center justify-between p-3 rounded-xl">
                  <div className="flex items-center gap-3">
                    <FiMoon size={20} style={{ color: "var(--primary)" }} />
                    <div>
                      <div>Dark Mode</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        Toggle between dark and light UI
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={theme === "dark"}
                        onChange={toggleTheme}
                      />
                      <div
                        className="w-11 h-6 rounded-full peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white"
                        style={{
                          background: theme === "dark" ? "var(--primary)" : "#9ca3af",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: theme === "dark" ? "calc(100% - 18px)" : "6px",
                            transform: "translateY(-50%)",
                            width: 14,
                            height: 14,
                            background: "#ffffff",
                            borderRadius: "50%",
                            transition: "left 0.18s",
                          }}
                        />
                      </div>
                    </label>
                  </div>
                </div>

                <div className="p-2 rounded-lg">
                  <div className="mb-2 text-sm font-medium" style={{ color: "var(--muted)" }}>
                    Theme Color
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {THEME_PRESETS.map((p) => {
                      const selected = p.color.toLowerCase() === primaryColor.toLowerCase();
                      return (
                        <button
                          key={p.color}
                          onClick={() => chooseColor(p.color)}
                          title={p.name}
                          className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm"
                          style={{
                            background: p.color,
                            boxShadow: selected ? "0 0 0 4px rgba(0,0,0,0.2) inset, 0 6px 16px rgba(0,0,0,0.2)" : "",
                            transform: selected ? "scale(1.05)" : "scale(1)",
                          }}
                        />
                      );
                    })}
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => chooseColor(e.target.value)}
                      className="ml-2 w-10 h-10 p-0 border-0 bg-transparent"
                      title="Custom color"
                    />
                  </div>
                  <div className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                    Selected primary: <span style={{ color: "var(--primary)", fontWeight: 600 }}>{primaryColor}</span>
                  </div>
                </div>
              </div>

              <div
                className="rounded-2xl p-4 space-y-2 mt-4"
                style={{
                  background: theme === "dark" ? "#1F2937" : "var(--panel-bg)",
                  color: theme === "dark" ? "#fff" : "var(--text)",
                }}
              >
                <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
                  Security
                </p>

                <button
                  className="w-full flex justify-between items-center p-3 rounded-xl hover:opacity-95 transition-all"
                  style={{ background: "transparent", color: "var(--text)" }}
                >
                  <div className="flex items-center gap-3">
                    <FiShield size={20} style={{ color: "var(--primary)" }} />
                    <span>Privacy & Security</span>
                  </div>
                  <FiChevronRight size={18} style={{ color: "var(--muted)" }} />
                </button>
              </div>

              <div className="w-full border-t border-gray-700 my-6"></div>

              <div className="w-full text-sm text-center mb-2" style={{ color: "var(--muted)" }}>
                <div>Your ID:</div>
                <div className="font-semibold" style={{ color: "var(--text)" }}>{uniqueId}</div>
              </div>
            </div>

            <div
              className="fixed bottom-5 left-1/2 transform -translate-x-1/2 w-[420px] max-w-full px-5 z-[1000000]"
              style={{ pointerEvents: "auto" }}
            >
              <button
                onClick={handleLogout}
                className="w-full flex justify-center items-center gap-2 py-3 rounded-xl transition-all shadow-lg"
                style={{ background: "var(--primary)", color: "#fff" }}
              >
                <FiLogOut size={18} />
                Logout
              </button>
            </div>
          </div>
        </>
      )}

      {/* Profile Page — Fullscreen Overlay */}
      {showProfile && (
        <div
          className="fixed inset-0 flex flex-col items-center justify-start z-50"
          style={{ background: "var(--app-bg)", color: "var(--text)" }}
        >
          <div className="flex items-center w-full px-4 py-3" style={{ background: "var(--panel-bg)" }}>
            <button
              onClick={() => setShowProfile(false)}
              className="p-2 rounded-full hover:bg-gray-700 transition"
              style={{ color: "var(--muted)" }}
            >
              <FiArrowLeft size={22} />
            </button>
            <h2 className="flex-1 text-xl font-semibold">Your Profile</h2>
            <div className="w-8" />
          </div>

          <div className="flex-1 w-full max-w-[420px] mx-auto px-6 py-6 overflow-y-auto flex flex-col items-center">
            <div className="mt-16 mb-6 relative">
              <div className="w-24 h-24 rounded-full flex items-center justify-center relative" style={{ background: "var(--panel-bg)" }}>
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Profile"
                    className="w-24 h-24 rounded-full object-cover"
                  />
                ) : (
                  <FiUser size={50} style={{ color: "var(--muted)" }} />
                )}

                <input
                  type="file"
                  accept="image/*"
                  ref={profilePicInputRef}
                  style={{ display: "none" }}
                  onChange={handleProfilePicChange}
                />

                <button
                  className="absolute bottom-1 right-1 rounded-full p-1"
                  onClick={() => profilePicInputRef.current.click()}
                  style={{ background: "var(--primary)", color: "#fff" }}
                >
                  <FiEdit2 size={14} />
                </button>
              </div>
            </div>

            <div className="w-full rounded-xl p-4 text-sm flex flex-col gap-3" style={{ background: "var(--panel-bg)", color: "var(--text)" }}>
              <div>
                <span className="font-semibold">Name: </span>
                {editingUsername ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="p-2 rounded-xl border outline-none"
                      style={{
                        background: "var(--input-bg)",
                        color: "var(--input-text)",
                        borderColor: theme === "dark" ? "#4b5563" : "#d1d5db",
                      }}
                    />
                    <button
                      onClick={handleUsernameChange}
                      className="p-2 rounded-xl"
                      style={{ background: "var(--primary)", color: "#fff" }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingUsername(false)}
                      className="p-2 rounded-xl"
                      style={{ background: "#6b7280", color: "#fff" }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span>
                    {username || "Unknown"}{" "}
                    <button
                      onClick={() => setEditingUsername(true)}
                      style={{ color: "var(--primary)" }}
                    >
                      <FiEdit2 size={14} />
                    </button>
                  </span>
                )}
              </div>
              <div>
                <span className="font-semibold">Email:</span> {user?.email || "Not available"}
              </div>
              <div>
                <span className="font-semibold">User ID:</span> {uniqueId}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search & Inbox */}
      {!selectedUser && !settingsPage && !showProfile && !showReels && (
        <div className="w-full max-w-[420px] mb-4">
          <div className="flex gap-2 mb-2 flex-col sm:flex-row p-1 rounded-full">
            <input
              type="text"
              placeholder="Search and start new chat"
              className="flex-1 p-2 outline-none rounded-full transition-all duration-300"
              style={{
                background: theme === "dark" ? "#1f2937" : "#f3f4f6",
                color: theme === "dark" ? "#fff" : "#000",
              }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {searchResult && (
            <div
              className="flex items-center p-2 mb-2 rounded-xl cursor-pointer"
              style={{ background: "var(--card-bg)", color: "var(--text)" }}
              onClick={() => startPrivateChat(searchResult)}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center mr-3" style={{ background: "var(--primary)", color: "#fff" }}>
                {searchResult.username[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="font-semibold">{searchResult.username}</div>
                <div className="text-sm" style={{ color: "var(--muted)" }}>
                  ID: {searchResult.uniqueId}
                </div>
              </div>
              <div className={`w-3 h-3 rounded-full ${searchResult.isOnline ? "bg-green-500" : "bg-gray-400"}`}></div>
            </div>
          )}

          {inbox.length > 0 && (
            <div className="mt-4 rounded-xl max-h-100 overflow-y-auto bg-white" style={{ background: "var(--panel-bg)" }}>
              {inbox.map((chat) => {
                const otherUser = usersMap[chat.otherUid];
                if (!otherUser) return null;

                return (
                  <div
                    key={chat.chatId}
                    className="flex items-center p-2 hover:opacity-95 relative group"
                    onClick={() => startPrivateChat(otherUser)}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center mr-3" style={{ background: "var(--primary)", color: "#fff" }}>
                      {otherUser.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{otherUser.username}</div>
                      <div className="text-sm" style={{ color: "var(--muted)" }}>
                        {chat.lastMessage?.text || "No messages yet"}
                      </div>
                    </div>
                    <div className={`w-3 h-3 rounded-full ${otherUser.isOnline ? "bg-green-500" : "bg-gray-400"}`}></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Private Chat */}
      {selectedUser && (
        <div
          className="fixed sm:relative inset-0 w-screen h-screen sm:w-full sm:max-w-[420px] sm:h-[650px] bg-gray-800 shadow-2xl flex flex-col animate-fadeIn z-50"
          style={{ background: "var(--panel-bg)" }}
        >
          <div
            className="sticky top-0 flex items-center justify-between px-4 py-3 shadow-md z-10"
            style={{ background: "var(--panel-bg)", color: "var(--text)" }}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setShowChatMenu(false);
                }}
                className="text-xl p-1 rounded-full"
                style={{ color: "var(--muted)" }}
              >
                ←
              </button>

              {selectedUser.profilePic ? (
                <img
                  src={selectedUser.profilePic}
                  alt="Profile"
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold"
                  style={{ background: "var(--primary)", color: "#fff" }}
                >
                  {selectedUser.username[0].toUpperCase()}
                </div>
              )}

              <span className="font-semibold">{selectedUser.username}</span>
            </div>

            <div className="flex items-center gap-4 relative">
              <button className="hover:bg-gray-700 p-2 rounded-full">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5h2l3 5-2 2 3 5 5-3 2 2 5 3V5H3z"
                  />
                </svg>
              </button>

              <button className="hover:bg-gray-700 p-2 rounded-full">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-6 0H5a2 2 0 01-2-2V10a2 2 0 012-2h4m6 0v4m0 0l4 4"
                  />
                </svg>
              </button>

              <button
                className="hover:bg-gray-700 p-2 rounded-full relative"
                onClick={() => setShowChatMenu(!showChatMenu)}
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </button>

              {showChatMenu && (
                <div
                  className={`absolute z-50 w-[160px] rounded-2xl shadow-lg px-1 py-1 select-none top-12 right-0
                    ${theme === "dark" 
                      ? "bg-gray-800 border border-gray-700" 
                      : "bg-white border border-gray-300"}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className={`absolute -top-2 right-4 w-3 h-3 rotate-45
                      ${theme === "dark"
                        ? "bg-gray-800 border-l border-t border-gray-700"
                        : "bg-white border-l border-t border-gray-300"
                      }`}
                  ></div>

                  <button
                    onClick={deleteChat}
                    className={`flex items-center w-full px-3 py-2 rounded-xl text-sm transition duration-150
                      ${theme === "dark"
                        ? "text-red-400 hover:bg-gray-700"
                        : "text-red-500 hover:bg-red-100"
                      }`}
                  >
                    <FiTrash2 size={14} className="mr-2" />
                    Delete Chat
                  </button>
                </div>
              )}
            </div>
          </div>

          <div
            ref={messagesContainerRef}
            className="flex-grow p-1 overflow-y-auto space-y-3"
            style={{ paddingBottom: "60px" }}
            onClick={() => {
              setShowDeletePopupId(null);
              setShowChatMenu(false);
            }}
          >
            {messages.map((msg, i) => {
              const isOwn = msg.senderUid === user.uid;
              const isMedia = msg.file;
              let touchStartX = null;
              let longPressTimeout = null;

              return (
                <div
                  key={i}
                  className={`flex ${isOwn ? "justify-end" : "justify-start"} px-3 my-1`}
                >
                  <div
                    className={`relative group max-w-[80%] sm:max-w-[70%] break-words transition-transform duration-200 ease-out`}
                    style={{
                      background: isOwn
                        ? "var(--primary)"
                        : theme === "dark"
                        ? "#374151"
                        : "#E5E7EB",
                      color: isOwn ? "#fff" : theme === "dark" ? "#fff" : "#000",
                      borderRadius: 16,
                      borderTopLeftRadius: isOwn ? 16 : 6,
                      borderTopRightRadius: isOwn ? 6 : 16,
                      borderBottomLeftRadius: 16,
                      borderBottomRightRadius: 16,
                      padding: "8px",
                      transition: "transform 0.25s ease",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      touchAction: "manipulation",
                      position: "relative",
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (isOwn || !isMedia) {
                        setShowDeletePopupId(msg.time);
                      }
                    }}
                    onTouchStart={(e) => {
                      touchStartX = e.touches[0].clientX;
                      if (isOwn) {
                        longPressTimeout = setTimeout(() => {
                          setShowDeletePopupId(msg.time);
                        }, 600);
                      }
                    }}
                    onTouchMove={(e) => {
                      if (!touchStartX) return;
                      const diff = e.touches[0].clientX - touchStartX;
                      if (
                        (isOwn && diff < 0 && Math.abs(diff) < 100) ||
                        (!isOwn && diff > 0 && diff < 100)
                      ) {
                        e.currentTarget.style.transform = `translateX(${diff}px)`;
                      }
                      if (longPressTimeout) clearTimeout(longPressTimeout);
                    }}
                    onTouchEnd={(e) => {
                      if (!touchStartX) return;
                      const diff = e.changedTouches[0].clientX - touchStartX;
                      if ((!isOwn && diff > 60) || (isOwn && diff < -60)) {
                        setReplyingTo(msg);
                        setTimeout(() => {
                          document.querySelector("#messageInput")?.focus();
                        }, 100);
                      }
                      e.currentTarget.style.transform = "translateX(0)";
                      touchStartX = null;
                      if (longPressTimeout) clearTimeout(longPressTimeout);
                    }}
                  >
                    <div
                      className={`absolute ${
                        isOwn ? "-left-7" : "-right-7"
                      } top-1/2 -translate-y-1/2 hidden sm:flex opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setReplyingTo(msg);
                        setTimeout(() => {
                          document.querySelector("#messageInput")?.focus();
                        }, 100);
                      }}
                      title="Reply"
                    >
                      <span className="text-gray-500 hover:text-blue-500 text-lg">↪</span>
                    </div>

                    {msg.replyTo && (
                      <div
                        className="px-2 py-1 mb-1 rounded-md text-xs break-words"
                        style={{
                          background: isOwn
                            ? "rgba(255,255,255,0.2)"
                            : theme === "dark"
                            ? "#4b5563"
                            : "#d1d5db",
                          color: isOwn
                            ? "#fff"
                            : theme === "dark"
                            ? "#e5e7eb"
                            : "#111827",
                          borderLeft: `3px solid ${
                            isOwn ? "#fff" : "var(--primary)"
                          }`,
                        }}
                      >
                        {isOwn
                          ? `You replied : ${msg.replyTo.text || "Media"}`
                          : `${msg.replyTo.senderName} replied : ${
                              msg.replyTo.text || "Media"
                            }`}
                      </div>
                    )}

                    <div className={`px-3 py-0.5 ${!isMedia ? "pr-14" : "p-0"} flex flex-col`}>
                      {!isOwn && !isMedia && (
                        <div className="text-xs font-semibold mb-1" style={{ color: theme === "dark" ? "#D1D5DB" : "#111827" }}>
                          {msg.senderName}
                        </div>
                      )}
                      {msg.text && (
                        <div className="text-sm leading-snug whitespace-pre-wrap mb-1">{msg.text}</div>
                      )}
                      {msg.file && (
                        <div className="relative mt-1">
                          {msg.fileType === "image" ? (
                            <img
                              src={msg.file}
                              alt="sent"
                              className="rounded-lg max-w-full cursor-pointer"
                              onClick={() => {
                                setLightboxMedia(msg.file);
                                setLightboxType("image");
                                setLightboxLoading(true);
                              }}
                            />
                          ) : (
                            <video controls className="rounded-lg max-w-full">
                              <source src={msg.file} type={msg.fileType} />
                            </video>
                          )}
                          <div className="absolute bottom-1 right-1 text-[10px] select-none px-1 py-[1px] rounded bg-black/40 text-white">
                            {msg.time}
                          </div>
                        </div>
                      )}
                    </div>

                    {!isMedia && (
                      <div className="absolute text-[8.8px] bottom-1 right-2 select-none" style={{ color: theme === "dark" ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.7)" }}>
                        {msg.time}
                      </div>
                    )}

                    {!isMedia && (
                      <div
                        className="absolute bottom-0"
                        style={
                          isOwn
                            ? { right: "-2px", width: 10, height: 0, borderTop: "8px solid transparent", borderLeft: `8px solid var(--primary)`, transform: "translateY(-2px)" }
                            : { left: "-2px", width: 10, height: 0, borderTop: "8px solid transparent", borderRight: `8px solid ${theme === "dark" ? "#374151" : "#E5E7EB"}`, transform: "translateY(-2px)" }
                        }
                      />
                    )}

                    {showDeletePopupId === msg.time && (
                      <div
                        className={`absolute z-50 w-[160px] rounded-2xl shadow-lg px-1 py-1 select-none 
                          ${theme === "dark" 
                            ? "bg-gray-800 border border-gray-700" 
                            : "bg-white border border-gray-300"}`}
                        style={{
                          top: "-65px",
                          left: "50%",
                          transform: "translateX(-50%)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45
                            ${theme === "dark"
                              ? "bg-gray-800 border-l border-t border-gray-700"
                              : "bg-white border-l border-t border-gray-300"
                            }`}
                        ></div>

                        <button
                          onClick={() => {
                            const textToCopy = msg.text || "";
                            if (!textToCopy) return;

                            if (navigator.clipboard && window.isSecureContext) {
                              navigator.clipboard.writeText(textToCopy).then(() => {
                                setShowDeletePopupId(null);
                              });
                            } else {
                              const textArea = document.createElement("textarea");
                              textArea.value = textToCopy;
                              textArea.style.position = "fixed";
                              textArea.style.top = "-9999px";
                              textArea.style.left = "-9999px";
                              document.body.appendChild(textArea);
                              textArea.select();
                              try {
                                document.execCommand("copy");
                              } catch {
                                alert("Failed to copy message");
                              }
                              document.body.removeChild(textArea);
                              setShowDeletePopupId(null);
                            }
                          }}
                          className={`flex items-center w-full px-3 py-2 mb-1 rounded-xl text-sm transition duration-150
                            ${theme === "dark"
                              ? "text-gray-200 hover:bg-gray-700"
                              : "text-gray-800 hover:bg-gray-100"
                            }`}
                        >
                          <span className="mr-2">📋</span> Copy
                        </button>

                        {isOwn && (
                          <button
                            onClick={async () => {
                              try {
                                const chatId = [user.uid, selectedUser.uid].sort().join("_");
                                const chatRef = ref(db, `privateChats/${chatId}`);
                                const snap = await get(chatRef);
                                const data = snap.val();
                                if (!data) return;

                                const key = Object.keys(data).find(
                                  (k) => data[k].senderUid === user.uid && data[k].time === msg.time
                                );

                                if (key) {
                                  await deleteMessage(key);
                                }
                              } catch (error) {
                                console.error("Failed to delete message:", error);
                              } finally {
                                setShowDeletePopupId(null);
                              }
                            }}
                            className={`flex items-center w-full px-3 py-2 rounded-xl text-sm transition duration-150
                              ${theme === "dark"
                                ? "text-red-400 hover:bg-gray-700"
                                : "text-red-500 hover:bg-red-100"
                              }`}
                          >
                            <span className="mr-2">🗑️</span> Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef}></div>

            {lightboxMedia &&
              ReactDOM.createPortal(
                <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50" onClick={() => setLightboxMedia(null)}>
                  {lightboxLoading && <div className="text-white text-sm animate-pulse">Loading...</div>}
                  {lightboxType === "image" && (
                    <img src={lightboxMedia} alt="Preview" className={`max-h-[90vh] max-w-[90vw] ${lightboxLoading ? "hidden" : "block"}`} onLoad={() => setLightboxLoading(false)} />
                  )}
                  {lightboxType === "video" && (
                    <video controls className="max-h-[90vh] max-w-[90vw]" onLoadedData={() => setLightboxLoading(false)}>
                      <source src={lightboxMedia} type="video/mp4" />
                    </video>
                  )}
                </div>,
                document.body
              )}
            <div ref={messagesEndRef}></div>
          </div>
          {replyingTo && (
            <div className="flex justify-between items-center px-3 py-2 mb-1 rounded-md bg-gray-900 text-white sticky bottom-[52px] shadow-md border-t-2 border-gray-800">
              <div className="text-xs truncate max-w-[80%] whitespace-pre-wrap">
                {replyingTo.senderUid === user.uid ? (
                  <>
                    Replying to yourself{"\n"}
                    {replyingTo.text || "Media"}
                  </>
                ) : (
                  <>
                    Replying to {replyingTo.senderName} {"\n"}
                    {replyingTo.text || "Media"}
                  </>
                )}
              </div>
              <button onClick={() => setReplyingTo(null)} className="text-xs font-bold px-1">
                ✕
              </button>
            </div>
          )}

          <div className="sticky bottom-0 bg-gray-800 flex items-center p-2 transition-all duration-300" style={{ background: "transparent", color: "var(--muted)" }}>
            <div className="flex items-center w-full relative transition-all duration-300 ease-in-out">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept="image/*,video/*"
                onChange={sendFile}
              />

              <input
                id="messageInput"
                type="text"
                className="p-2.5 pl-5 pr-16 rounded-full outline-none w-full transition-all duration-300"
                placeholder="Message"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                onFocus={() => {
                  messagesContainerRef.current.scrollTop =
                    messagesContainerRef.current.scrollHeight;
                }}
                style={{
                  background: theme === "light" ? "#e5e7eb" : "#374151",
                  color: theme === "light" ? "#000" : "#fff",
                }}
              />

              {!text.trim() && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current.click()}
                  className="absolute right-2 rounded-full p-2 animate-galleryIn"
                  style={{ background: "transparent", color: "var(--muted)" }}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10l4-4 4 4 4-4 4 4v8H3v-8z"
                    />
                  </svg>
                </button>
              )}

              {text.trim() && (
                <button
                  onClick={sendMessage}
                  className="absolute right-2 rounded-full p-2 animate-slideIn"
                  style={{ background: "var(--primary)", color: "#fff" }}
                >
                  <svg
                    className="w-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4.5 19.5l15-7.5-15-7.5v5.25l9 2.25-9 2.25v5.25z"
                    />
                  </svg>
                </button>
              )}
            </div>

            <style>{`
              @keyframes slideIn {
                0% { opacity: 0; transform: translateX(10px) scale(0.8); }
                100% { opacity: 1; transform: translateX(0) scale(1); }
              }
              .animate-slideIn {
                animation: slideIn 0.35s ease-out forwards;
              }

              @keyframes galleryIn {
                0% { opacity: 0; transform: translateX(10px) scale(0.8); }
                100% { opacity: 1; transform: translateX(0) scale(1); }
              }
              .animate-galleryIn {
                animation: galleryIn 0.35s ease-out forwards;
              }
            `}</style>
          </div>
        </div>
      )}

      {showReels && <ReelsPage onBack={() => setShowReels(false)} />}

      {!selectedUser && !showReels && !settingsPage && (
        <div
          className="fixed bottom-[-8px] left-1/2 transform -translate-x-1/2 w-[420px] flex justify-center items-center py-3 rounded-t-2xl shadow-2xl"
          style={{ background: "var(--panel-bg)" }}
        >
          <div className="absolute top-[8px] left-0 w-full border-t-[1px]" style={{ borderColor: "rgba(148,163,184,0.06)" }}></div>

          <button
            onClick={() => setShowReels(true)}
            className="rounded-full p-1 transition-all"
            style={{ background: "var(--card-bg)", color: "var(--primary)" }}
          >
            <FiVideo size={25} />
          </button>
        </div>
      )}
    </div>
  );
}
