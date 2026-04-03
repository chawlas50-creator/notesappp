/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  getDocFromServer,
  Timestamp 
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Settings, 
  ChevronLeft, 
  Search, 
  LogOut, 
  Sparkles,
  Loader2,
  StickyNote,
  Clock,
  Folder
} from 'lucide-react';
import { auth, db, googleProvider, signInWithPopup, signOut } from './firebase';
import { cn } from './lib/utils';
import { Note as NoteType } from './types';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [notes, setNotes] = useState<NoteType[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Test Firestore connection on boot
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Notes Listener
  useEffect(() => {
    if (!user || !isAuthReady) {
      setNotes([]);
      return;
    }

    const q = query(
      collection(db, 'notes'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as NoteType[];
      setNotes(fetchedNotes);
    }, (error) => {
      console.error("Firestore Error: ", error);
      setStatus({ text: "Failed to load notes. Check permissions.", type: 'error' });
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
      setStatus({ text: "Failed to sign in.", type: 'error' });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowSettings(false);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const getCategoryFromAI = async (text: string, existingCategories: string[]) => {
    try {
      const categoriesStr = existingCategories.length > 0 
        ? `Existing categories: ${existingCategories.join(', ')}` 
        : "No existing categories.";
      
      const prompt = `You are a note organizer. Given a new note and a list of existing categories, return ONLY a category name (2 words max) that best fits the note. If it doesn't fit any existing category well, create a new one.
${categoriesStr}
New note: "${text}"
Category:`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      return response.text?.trim() || "General";
    } catch (error) {
      console.error("AI Error:", error);
      return "General";
    }
  };

  const saveNote = async () => {
    if (!inputText.trim() || !user) return;

    setIsSaving(true);
    setStatus({ text: "AI is sorting your note...", type: 'info' });

    try {
      const existingCategories = Array.from(new Set(notes.map(n => n.category)));
      const category = await getCategoryFromAI(inputText, existingCategories);

      await addDoc(collection(db, 'notes'), {
        text: inputText.trim(),
        category,
        createdAt: Date.now(),
        userId: user.uid
      });

      setInputText('');
      setStatus({ text: `Saved to ${category}`, type: 'success' });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error("Save Error:", error);
      setStatus({ text: "Failed to save note.", type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notes', id));
    } catch (error) {
      console.error("Delete Error:", error);
      setStatus({ text: "Failed to delete note.", type: 'error' });
    }
  };

  const groupedNotes = notes
    .filter(note => 
      note.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.category.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .reduce((acc, note) => {
      if (!acc[note.category]) acc[note.category] = [];
      acc[note.category].push(note);
      return acc;
    }, {} as Record<string, NoteType[]>);

  const timeAgo = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    return Math.floor(diff / 86400) + "d ago";
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f7] p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl shadow-gray-200/50"
        >
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Smart Notes AI</h1>
          <p className="text-gray-500 mb-8">Capture everything. Let AI organize it for you instantly.</p>
          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" referrerPolicy="no-referrer" />
            Continue with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-gray-900 font-sans pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Smart Notes</h1>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">AI Organized</p>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <Settings className="w-6 h-6 text-gray-500" />
        </button>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        {/* Input Area */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-8">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="What's on your mind? (e.g. Buy milk, Movies to watch, Project ideas...)"
            className="w-full min-h-[100px] text-lg bg-transparent border-none focus:ring-0 resize-none placeholder:text-gray-300"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveNote();
              }
            }}
          />
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              {status && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "text-sm font-medium flex items-center gap-2",
                    status.type === 'error' ? "text-red-500" : 
                    status.type === 'success' ? "text-green-500" : "text-blue-500"
                  )}
                >
                  {status.type === 'info' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {status.text}
                </motion.div>
              )}
            </div>
            <button
              onClick={saveNote}
              disabled={!inputText.trim() || isSaving}
              className="px-6 py-2 bg-blue-600 disabled:bg-blue-200 text-white rounded-full font-semibold transition-all active:scale-95 flex items-center gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
              Save
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search notes or categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-100 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
          />
        </div>

        {/* Notes List */}
        <div className="space-y-8">
          {Object.entries(groupedNotes).length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <StickyNote className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-gray-400 font-medium">No notes found</p>
            </div>
          ) : (
            Object.entries(groupedNotes).map(([category, catNotes]) => (
              <div key={category} className="space-y-3">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Folder className="w-3 h-3" />
                    {category}
                  </h2>
                  <span className="text-xs text-gray-300 font-medium">{catNotes.length}</span>
                </div>
                <div className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    {catNotes.map((note) => (
                      <motion.div
                        key={note.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="group bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-blue-100 transition-all"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                            <div className="flex items-center gap-3 mt-3">
                              <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {timeAgo(note.createdAt)}
                              </span>
                            </div>
                          </div>
                          <button 
                            onClick={() => deleteNote(note.id)}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Settings Overlay */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h2 className="font-bold">Settings</h2>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                  <img 
                    src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                    className="w-12 h-12 rounded-full border-2 border-white shadow-sm"
                    alt="User"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <p className="font-bold text-gray-900">{user.displayName}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2">Account</p>
                  <button 
                    onClick={handleLogout}
                    className="w-full p-4 flex items-center gap-3 text-red-500 hover:bg-red-50 rounded-2xl transition-colors font-semibold"
                  >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                  </button>
                </div>

                <div className="pt-4 text-center">
                  <p className="text-[10px] text-gray-300 font-medium uppercase tracking-tighter">Smart Notes AI v1.0</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
