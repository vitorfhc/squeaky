export interface Profile {
  email: string;
  displayName: string;
  score: number;
  coins: number;
  wins: number;
  matchesPlayed: number;
}
const PROFILE_KEY = 'squeaky.profile';
export const loadProfile = (): Profile | undefined => {
  const value = localStorage.getItem(PROFILE_KEY);
  if (!value) return undefined;
  try {
    return JSON.parse(value) as Profile;
  } catch {
    return undefined;
  }
};
export const saveProfile = (profile: Profile): void =>
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
export const makeProfile = (email: string): Profile => ({
  email,
  displayName: email.split('@')[0] || 'Player',
  score: 0,
  coins: 0,
  wins: 0,
  matchesPlayed: 0,
});
