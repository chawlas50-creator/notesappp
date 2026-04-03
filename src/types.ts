export interface Note {
  id: string;
  text: string;
  category: string;
  createdAt: number;
  userId: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}
