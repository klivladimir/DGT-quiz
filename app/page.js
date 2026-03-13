import FlashcardsClient from "../components/FlashcardsClient";
import loadFlashcards from "../lib/loadFlashcards";

export default async function HomePage() {
  const cards = await loadFlashcards();
  return <FlashcardsClient cards={cards} />;
}
