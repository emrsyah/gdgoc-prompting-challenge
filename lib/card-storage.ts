import { Card, BestScore } from '@/types/card';

const CARDS_STORAGE_KEY = 'gdgoc-cards';

export class CardStorage {
  static getCards(): Card[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(CARDS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error reading cards from localStorage:', error);
      return [];
    }
  }

  static saveCards(cards: Card[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
    } catch (error) {
      console.error('Error saving cards to localStorage:', error);
    }
  }

  static updateCardBestScore(cardId: number, bestScore: BestScore): void {
    const cards = this.getCards();
    const cardIndex = cards.findIndex(card => card.id === cardId);

    if (cardIndex !== -1) {
      // Check if this is a better score than current best
      const currentBest = cards[cardIndex].best;
      if (!currentBest || bestScore.score > currentBest.score) {
        cards[cardIndex].best = bestScore;
        this.saveCards(cards);
      }
    }
  }

  static initializeDefaultCards(): Card[] {
    const faculties = [
      "Fakultas Informatika",
      "Fakultas Teknik Elektro",
      "Fakultas Industri Kreatif",
      "Fakultas Rekayasa Industri",
      "Fakultas Komunikasi Sosial",
      "Fakultas Ekonomi Bisnis",
      "Fakultas Industri Terapan"
    ];

    const defaultCards: Card[] = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      image: `/images/image-${index + 1}.png`,
      name: `Items ${index + 1}`,
      best: null
    }));

    const existingCards = this.getCards();

    // If no cards exist, initialize with defaults
    if (existingCards.length === 0) {
      this.saveCards(defaultCards);
      return defaultCards;
    }

    // Check if we need to add any missing cards (new images)
    const maxExistingId = Math.max(...existingCards.map(card => card.id));
    const missingCards = defaultCards.filter(card => card.id > maxExistingId);

    if (missingCards.length > 0) {
      const updatedCards = [...existingCards, ...missingCards];
      this.saveCards(updatedCards);
      return updatedCards;
    }

    return existingCards;
  }

  static getCardById(cardId: number): Card | null {
    const cards = this.getCards();
    return cards.find(card => card.id === cardId) || null;
  }
}
