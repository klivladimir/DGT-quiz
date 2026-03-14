"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import styles from "./FlashcardsClient.module.css";

const BASE_UI_TEXT = {
  empty: "No se encontraron tarjetas en output/todotest-tip-3.json.",
  question: "Pregunta",
  test: "Test",
  correctAnswer: "Respuesta correcta",
  yourAnswer: "Tu respuesta",
  noExplanation: "No hay explicación disponible.",
  back: "Atrás",
  check: "Comprobar",
  retry: "Reintentar",
  random: "Random",
  next: "Siguiente",
  loading: "Traduciendo...",
  settings: "Ajustes",
  chooseLanguage: "Idioma nativo",
  openFutureModal: "Abrir modal de ajustes (próximamente)",
  enableTranslation: "Activar traducción",
  disableTranslation: "Desactivar traducción",
  closePanel: "Cerrar",
};

const COMMON_LANGUAGE_CODES = [
  "en",
  "ru",
  "uk",
  "fr",
  "de",
  "it",
  "pt",
  "pl",
  "tr",
  "ar",
  "zh-CN",
  "ja",
  "ko",
  "hi",
];

const PROGRESS_STORAGE_KEY = "todotest.flashcards.progress.v3";

function normalizeStats(raw) {
  if (!raw || typeof raw !== "object") {
    return { hard: 0, unsure: 0, easy: 0, total: 0, correct: 0, wrong: 0 };
  }

  const toNonNegativeInt = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

  return {
    hard: toNonNegativeInt(raw.hard),
    unsure: toNonNegativeInt(raw.unsure),
    easy: toNonNegativeInt(raw.easy),
    total: toNonNegativeInt(raw.total),
    correct: toNonNegativeInt(raw.correct),
    wrong: toNonNegativeInt(raw.wrong),
  };
}

function normalizeAnswerMemory(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const normalized = {};

  for (const [cardId, values] of Object.entries(raw)) {
    if (!Array.isArray(values)) continue;

    const cleaned = values
      .map((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2) return null;
        const isCorrect = Boolean(entry[0]);
        const difficulty = Number(entry[1]);
        if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 2) return null;
        return [isCorrect, difficulty];
      })
      .filter(Boolean)
      .slice(-3);

    if (cleaned.length > 0) {
      normalized[cardId] = cleaned;
    }
  }

  return normalized;
}

function ratingToDifficulty(nextRating) {
  if (nextRating === "easy") return 2;
  if (nextRating === "unsure") return 1;
  return 0;
}

function getHistoryDifficultyClass(difficulty) {
  if (difficulty === 0) return styles.historyDifficulty0;
  if (difficulty === 1) return styles.historyDifficulty1;
  return styles.historyDifficulty2;
}

function getOptionClass(state) {
  if (state === "correct") return `${styles.optionBtn} ${styles.optionCorrect}`;
  if (state === "wrong") return `${styles.optionBtn} ${styles.optionWrong}`;
  if (state === "selected") return `${styles.optionBtn} ${styles.optionSelected}`;
  return styles.optionBtn;
}

function normalizeLanguageCode(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const [lang, region] = raw.split("-");
  if (!lang) return "";
  if (!region) return lang.toLowerCase();
  return `${lang.toLowerCase()}-${region.toUpperCase()}`;
}

function getLanguageDisplayName(code) {
  try {
    const normalized = normalizeLanguageCode(code);
    if (!normalized) return code;
    const [langPart] = normalized.split("-");
    const display = new Intl.DisplayNames([normalized], { type: "language" });
    return display.of(langPart) || normalized;
  } catch {
    return code;
  }
}

function buildLanguageOptions(preferredCodes) {
  const orderedCodes = ["es", ...preferredCodes, ...COMMON_LANGUAGE_CODES];
  const unique = [];
  const seen = new Set();

  for (const code of orderedCodes) {
    const normalized = normalizeLanguageCode(code);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push({
      code: normalized,
      label: getLanguageDisplayName(normalized),
    });
  }

  return unique;
}

function toLanguageChipLabel(code) {
  const normalized = normalizeLanguageCode(code) || "es";
  return normalized.toUpperCase();
}

function buildSequentialOrder(length) {
  return Array.from({ length }, (_, index) => index);
}

function buildShuffledOrder(length, pinnedIndex) {
  const order = buildSequentialOrder(length);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [order[i], order[randomIndex]] = [order[randomIndex], order[i]];
  }

  if (Number.isInteger(pinnedIndex) && pinnedIndex >= 0 && pinnedIndex < length) {
    const pinnedPosition = order.indexOf(pinnedIndex);
    if (pinnedPosition > 0) {
      [order[0], order[pinnedPosition]] = [order[pinnedPosition], order[0]];
    }
  }

  return order;
}

function isValidOrder(order, length) {
  if (!Array.isArray(order) || order.length !== length) return false;
  const unique = new Set(order);
  if (unique.size !== length) return false;
  return order.every((value) => Number.isInteger(value) && value >= 0 && value < length);
}

export default function FlashcardsClient({ cards }) {
  const [order, setOrder] = useState(() => buildSequentialOrder(cards.length));
  const [position, setPosition] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [checked, setChecked] = useState(false);
  const [rating, setRating] = useState(null);
  const [randomEnabled, setRandomEnabled] = useState(false);
  const [answerStats, setAnswerStats] = useState(() => normalizeStats(null));
  const [answerMemoryByCard, setAnswerMemoryByCard] = useState(() => normalizeAnswerMemory(null));
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [translations, setTranslations] = useState({});
  const [uiTextByLanguage, setUiTextByLanguage] = useState({ es: BASE_UI_TEXT });
  const [isTranslatingCard, setIsTranslatingCard] = useState(false);
  const [isProgressHydrated, setIsProgressHydrated] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [preferredLanguageCodes, setPreferredLanguageCodes] = useState([]);

  const total = cards.length;
  const fallbackCardIndex = Math.min(total - 1, Math.max(0, position));
  const currentCardIndex = Number.isInteger(order[position]) ? order[position] : fallbackCardIndex;
  const card = cards[currentCardIndex];

  const activeLanguage = translationEnabled ? selectedLanguage : "es";
  const currentLanguageLabel = toLanguageChipLabel(activeLanguage);
  const t = uiTextByLanguage[activeLanguage] || BASE_UI_TEXT;
  const isTranslationActive = activeLanguage !== "es";
  const cardTranslationKey = card ? `${activeLanguage}:${card.id}` : "";
  const translatedCard = card ? translations[cardTranslationKey] : null;

  const languageOptions = useMemo(
    () => buildLanguageOptions(preferredLanguageCodes),
    [preferredLanguageCodes]
  );

  const currentCard = useMemo(() => {
    if (!card) return null;
    if (isTranslationActive && translatedCard) {
      return {
        ...card,
        testTitle: translatedCard.testTitle,
        questionText: translatedCard.questionText,
        options: card.options.map((option, optionIndex) => ({
          ...option,
          text: translatedCard.optionTexts[optionIndex] || option.text,
        })),
        explanation: translatedCard.explanation,
      };
    }
    return card;
  }, [card, isTranslationActive, translatedCard]);

  useEffect(() => {
    try {
      const browserLanguages = Array.isArray(navigator.languages) && navigator.languages.length
        ? navigator.languages
        : [navigator.language || "en"];
      setPreferredLanguageCodes(browserLanguages.map(normalizeLanguageCode).filter(Boolean));
    } catch {
      setPreferredLanguageCodes(["en"]);
    }
  }, []);

  useEffect(() => {
    if (isProgressHydrated || !cards?.length) return;

    try {
      const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
      if (!raw) {
        setIsProgressHydrated(true);
        return;
      }

      const saved = JSON.parse(raw);

      const savedLanguage = normalizeLanguageCode(saved.selectedLanguage || saved.targetLanguage || "en");
      if (savedLanguage) {
        setSelectedLanguage(savedLanguage);
      }

      setTranslationEnabled(Boolean(saved.translationEnabled) && savedLanguage !== "es");

      let restoredIndex = 0;
      if (typeof saved.cardId === "string") {
        const foundIndex = cards.findIndex((item) => item.id === saved.cardId);
        if (foundIndex >= 0) restoredIndex = foundIndex;
      } else if (Number.isInteger(saved.index)) {
        restoredIndex = Math.min(cards.length - 1, Math.max(0, saved.index));
      }

      const restoredCard = cards[restoredIndex];
      const restoredOption =
        typeof saved.selectedOption === "string" &&
        restoredCard?.options?.some((option) => option.key === saved.selectedOption)
          ? saved.selectedOption
          : null;

      const shouldEnableRandom = Boolean(saved.randomEnabled) && cards.length > 1;
      const savedOrder = shouldEnableRandom && isValidOrder(saved.randomOrder, cards.length)
        ? saved.randomOrder
        : null;
      const nextOrder = shouldEnableRandom
        ? savedOrder || buildShuffledOrder(cards.length, restoredIndex)
        : buildSequentialOrder(cards.length);
      const restoredPosition = shouldEnableRandom
        ? Math.max(0, nextOrder.indexOf(restoredIndex))
        : restoredIndex;

      setOrder(nextOrder);
      setPosition(restoredPosition);
      setRandomEnabled(shouldEnableRandom);
      setSelectedOption(restoredOption);
      setChecked(Boolean(saved.checked) && Boolean(restoredOption));
      setRating(
        saved.rating === "hard" || saved.rating === "unsure" || saved.rating === "easy"
          ? saved.rating
          : null
      );
      setAnswerStats(normalizeStats(saved.answerStats));
      setAnswerMemoryByCard(normalizeAnswerMemory(saved.answerMemoryByCard));
    } catch {
      // Ignore corrupted storage.
    } finally {
      setIsProgressHydrated(true);
    }
  }, [cards, isProgressHydrated]);

  useEffect(() => {
    if (!isProgressHydrated || !card) return;

    try {
      const payload = {
        index: currentCardIndex,
        cardId: card.id,
        selectedOption,
        checked,
        rating,
        randomEnabled,
        randomOrder: randomEnabled ? order : undefined,
        answerStats,
        answerMemoryByCard,
        selectedLanguage,
        translationEnabled,
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage write errors.
    }
  }, [
    isProgressHydrated,
    card,
    currentCardIndex,
    position,
    order,
    randomEnabled,
    selectedOption,
    checked,
    rating,
    answerStats,
    answerMemoryByCard,
    selectedLanguage,
    translationEnabled,
  ]);

  useEffect(() => {
    if (!isTranslationActive || uiTextByLanguage[activeLanguage]) return;

    let active = true;

    async function translateUiLabels() {
      try {
        const keys = Object.keys(BASE_UI_TEXT);
        const values = keys.map((key) => BASE_UI_TEXT[key]);

        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: activeLanguage,
            texts: values,
          }),
        });

        if (!response.ok) throw new Error("UI translation failed");
        const data = await response.json();
        const translatedValues = Array.isArray(data.texts) ? data.texts : values;

        if (!active) return;
        const translatedLabels = keys.reduce((acc, key, idx) => {
          acc[key] = translatedValues[idx] || BASE_UI_TEXT[key];
          return acc;
        }, {});

        setUiTextByLanguage((prev) => ({
          ...prev,
          [activeLanguage]: translatedLabels,
        }));
      } catch {
        if (!active) return;
        setUiTextByLanguage((prev) => ({
          ...prev,
          [activeLanguage]: BASE_UI_TEXT,
        }));
      }
    }

    translateUiLabels();
    return () => {
      active = false;
    };
  }, [activeLanguage, isTranslationActive, uiTextByLanguage]);

  useEffect(() => {
    if (!card || !isTranslationActive || translatedCard) return;

    let active = true;

    async function translateCurrentCard() {
      setIsTranslatingCard(true);
      try {
        const payload = {
          target: activeLanguage,
          texts: [
            card.testTitle,
            card.questionText,
            ...card.options.map((option) => option.text),
            card.explanation || "",
          ],
        };

        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error("Card translation failed");
        const data = await response.json();
        const translatedTexts = Array.isArray(data.texts) ? data.texts : [];
        const [testTitle, questionText, ...tail] = translatedTexts;
        const explanation = tail[tail.length - 1] || "";
        const optionTexts = tail.slice(0, Math.max(0, tail.length - 1));

        if (!active) return;
        setTranslations((prev) => ({
          ...prev,
          [cardTranslationKey]: {
            testTitle: testTitle || card.testTitle,
            questionText: questionText || card.questionText,
            optionTexts,
            explanation: explanation || card.explanation || "",
          },
        }));
      } catch {
        if (!active) return;
        setTranslations((prev) => ({
          ...prev,
          [cardTranslationKey]: {
            testTitle: card.testTitle,
            questionText: card.questionText,
            optionTexts: card.options.map((option) => option.text),
            explanation: card.explanation || "",
          },
        }));
      } finally {
        if (active) setIsTranslatingCard(false);
      }
    }

    translateCurrentCard();
    return () => {
      active = false;
    };
  }, [card, isTranslationActive, translatedCard, cardTranslationKey, activeLanguage]);

  function goPrev() {
    setPosition((current) => Math.max(0, current - 1));
    setSelectedOption(null);
    setChecked(false);
    setRating(null);
  }

  function goNext() {
    setPosition((current) => Math.min(total - 1, current + 1));
    setSelectedOption(null);
    setChecked(false);
    setRating(null);
  }

  function toggleRandomOrder() {
    if (total <= 1) return;

    const pinnedIndex = Number.isInteger(order[position]) ? order[position] : 0;
    const nextRandomState = !randomEnabled;

    if (nextRandomState) {
      const shuffledOrder = buildShuffledOrder(total, pinnedIndex);
      setOrder(shuffledOrder);
      setPosition(0);
    } else {
      setOrder(buildSequentialOrder(total));
      setPosition(pinnedIndex);
    }

    setRandomEnabled(nextRandomState);
    setSelectedOption(null);
    setChecked(false);
    setRating(null);
  }

  function rateAnswer(nextRating) {
    if (!selectedOption || (isTranslationActive && !translatedCard)) return;
    if (nextRating !== "hard" && nextRating !== "unsure" && nextRating !== "easy") return;

    const isCorrect = selectedOption === card.correctAnswer;
    setChecked(true);
    setRating(nextRating);
    setAnswerStats((prev) => ({
      ...prev,
      [nextRating]: prev[nextRating] + 1,
      total: prev.total + 1,
      correct: prev.correct + (isCorrect ? 1 : 0),
      wrong: prev.wrong + (isCorrect ? 0 : 1),
    }));
    setAnswerMemoryByCard((prev) => {
      const currentHistory = Array.isArray(prev[card.id]) ? prev[card.id] : [];
      const nextEntry = [isCorrect, ratingToDifficulty(nextRating)];
      return {
        ...prev,
        [card.id]: [...currentHistory, nextEntry].slice(-3),
      };
    });
  }

  function toggleTranslation() {
    if (!translationEnabled) {
      if (selectedLanguage === "es") {
        const fallbackLanguage =
          languageOptions.find((option) => option.code !== "es")?.code || "en";
        setSelectedLanguage(fallbackLanguage);
      }
      setTranslationEnabled(true);
      return;
    }

    setTranslationEnabled(false);
  }

  function optionState(optionKey) {
    if (!checked) return optionKey === selectedOption ? "selected" : "idle";
    if (optionKey === card.correctAnswer) return "correct";
    if (optionKey === selectedOption && selectedOption !== card.correctAnswer) return "wrong";
    return "idle";
  }

  if (!card) {
    return (
      <main className={styles.shell}>
        <Card className={styles.frame}>
          <p className={styles.kicker}>Flashcards</p>
          <h2 className={styles.testTitle}>Banco de preguntas</h2>
          <p className="mt-2 text-sm text-slate-300">{t.empty}</p>
        </Card>
      </main>
    );
  }

  const optionDisabled = checked || (isTranslationActive && !translatedCard);
  const canRate = Boolean(selectedOption) && !checked && !(isTranslationActive && !translatedCard);
  const shownCard = currentCard || card;
  const questionImages = Array.isArray(card.questionImages) ? card.questionImages : [];
  const currentCardHistory = Array.isArray(answerMemoryByCard[card.id]) ? answerMemoryByCard[card.id] : [];
  const topHistorySlots = [...currentCardHistory.slice(-3)];
  while (topHistorySlots.length < 3) topHistorySlots.unshift(null);

  return (
    <>
      <main className={styles.shell}>
        <Card className={styles.frame}>
          <div className="flex flex-col gap-3">
            <div className={styles.topRow}>
              <Button
                size="sm"
                className={`${styles.topTranslateButton} ${translationEnabled ? styles.topTranslateButtonActive : ""}`}
                onClick={toggleTranslation}
              >
                {currentLanguageLabel}
              </Button>

              <div className={styles.topHistory} aria-label="Últimas 3 respuestas">
                {topHistorySlots.map((entry, idx) => {
                  if (!entry) {
                    return <span key={`empty-${idx}`} className={`${styles.historyItem} ${styles.historyEmpty}`} />;
                  }

                  const isCorrect = Boolean(entry[0]);
                  const difficulty = Number(entry[1]);
                  const icon = isCorrect ? "✓" : "✕";
                  const iconClass = isCorrect ? styles.historyCorrect : styles.historyWrong;

                  return (
                    <span
                      key={`history-${idx}-${isCorrect ? "t" : "f"}-${difficulty}`}
                      className={`${styles.historyItem} ${getHistoryDifficultyClass(difficulty)}`}
                    >
                      <span className={iconClass}>{icon}</span>
                    </span>
                  );
                })}
              </div>

              <Button
                size="sm"
                variant={isSettingsOpen ? "default" : "outline"}
                className={`${styles.settingsTrigger} ${isSettingsOpen ? styles.settingsTriggerActive : ""}`}
                onClick={() => setIsSettingsOpen((value) => !value)}
                aria-label={t.settings}
              >
                ⚙
              </Button>
            </div>

            <h3 className={styles.questionTitle}>
              {isTranslationActive && !translatedCard ? t.loading : shownCard.questionText}
            </h3>

            {questionImages.length > 0 ? (
              <div className={`grid gap-2 ${questionImages.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {questionImages.map((url, imageIndex) => (
                  <div key={`${card.id}-img-${imageIndex}`} className={styles.imageCard}>
                    <img src={url} alt={`Imagen ${imageIndex + 1} de la pregunta`} className="h-auto w-full rounded-md" />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              {shownCard.options.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    if (!checked) setSelectedOption(option.key);
                  }}
                  disabled={optionDisabled}
                  className={getOptionClass(optionState(option.key))}
                >
                  <span className={styles.optionText}>
                    <span className={styles.optionPrefix}>{option.key})</span> {option.text}
                  </span>
                </button>
              ))}
            </div>

            {checked ? (
              <div className={styles.explanation}>
                <p className="mb-1 text-sm">
                  <strong>{t.correctAnswer}:</strong> {card.correctAnswer}
                </p>
                <p className="mb-1 text-sm">
                  <strong>{t.yourAnswer}:</strong> {selectedOption}
                </p>
                <p className="text-sm">
                  {isTranslationActive && !translatedCard ? t.loading : shownCard.explanation || t.noExplanation}
                </p>
              </div>
            ) : null}
          </div>

          <div className={styles.dock}>
            <div className={styles.controlPanel}>
              <Button
                className={styles.navCircle}
                onClick={goPrev}
                disabled={position === 0}
                aria-label={t.back}
              >
                <span className={styles.navIcon} aria-hidden="true">←</span>
              </Button>

              <div className={styles.ratingGroup}>
                <Button
                  className={`${styles.ratingBtn} ${styles.ratingHard} ${rating === "hard" ? styles.ratingActive : ""}`}
                  onClick={() => rateAnswer("hard")}
                  disabled={!canRate}
                >
                  HARD
                </Button>
                <Button
                  className={`${styles.ratingBtn} ${styles.ratingUnsure} ${rating === "unsure" ? styles.ratingActive : ""}`}
                  onClick={() => rateAnswer("unsure")}
                  disabled={!canRate}
                >
                  Unsure
                </Button>
                <Button
                  className={`${styles.ratingBtn} ${styles.ratingEasy} ${rating === "easy" ? styles.ratingActive : ""}`}
                  onClick={() => rateAnswer("easy")}
                  disabled={!canRate}
                >
                  EASY
                </Button>
              </div>

              <Button
                className={styles.navCircle}
                onClick={goNext}
                disabled={position === total - 1}
                aria-label={t.next}
              >
                <span className={styles.navIcon} aria-hidden="true">→</span>
              </Button>
            </div>

            {isTranslationActive && isTranslatingCard ? (
              <p className={`mt-2 text-center text-xs ${styles.translationHint}`}>{t.loading}</p>
            ) : null}
          </div>
        </Card>
      </main>

      <button
        type="button"
        className={`${styles.settingsBackdrop} ${isSettingsOpen ? styles.settingsBackdropOpen : ""}`}
        onClick={() => setIsSettingsOpen(false)}
        aria-label={t.closePanel}
      />

      <aside className={`${styles.settingsAside} ${isSettingsOpen ? styles.settingsAsideOpen : ""}`}>
        <div className={styles.settingsHeader}>
          <h3 className={styles.settingsTitle}>{t.settings}</h3>
          <button
            type="button"
            className={styles.settingsClose}
            onClick={() => setIsSettingsOpen(false)}
            aria-label={t.closePanel}
          >
            ✕
          </button>
        </div>

        <div className={styles.settingsField}>
          <label htmlFor="native-language" className={styles.settingsLabel}>
            {t.chooseLanguage}
          </label>
          <select
            id="native-language"
            className={styles.languageSelect}
            value={selectedLanguage}
            onChange={(event) => {
              const nextLanguage = normalizeLanguageCode(event.target.value) || "es";
              setSelectedLanguage(nextLanguage);
              if (nextLanguage === "es") {
                setTranslationEnabled(false);
              }
            }}
          >
            {languageOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label} ({option.code})
              </option>
            ))}
          </select>
        </div>

        <Button
          className={`${styles.settingsRandomButton} ${randomEnabled ? styles.settingsRandomButtonActive : ""}`}
          onClick={toggleRandomOrder}
          disabled={total <= 1}
        >
          {t.random}
        </Button>

        <Button className={styles.settingsFutureButton} disabled>
          {t.openFutureModal}
        </Button>
      </aside>
    </>
  );
}
