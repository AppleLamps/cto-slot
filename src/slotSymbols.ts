export type SlotSymbol = {
  id: string;
  emoji: string;
  label: string;
};

export const SLOT_SYMBOLS: SlotSymbol[] = [
  { id: 'bug', emoji: '🐛', label: 'Bug' },
  { id: 'coffee', emoji: '☕', label: 'Coffee' },
  { id: 'fire', emoji: '🔥', label: 'Server fire' },
  { id: 'error', emoji: '❌', label: 'Error' },
  { id: 'laptop', emoji: '💻', label: 'Laptop' }
];
