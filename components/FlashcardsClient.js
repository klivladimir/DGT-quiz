"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import styles from "./FlashcardsClient.module.css";

const UI_TEXT = {
  es: {
    empty: "No se encontraron tarjetas en output/todotest-tip-3.json.",
    question: "Pregunta",
    test: "Test",
    correctAnswer: "Respuesta correcta",
    yourAnswer: "Tu respuesta",
    noExplanation: "No hay explicación disponible.",
    back: "Atrás",
    check: "Comprobar",
    retry: "Reintentar",
    random: "Aleatoria",
    next: "Siguiente",
    loading: "Traduciendo...",
  },
  ru: {
    empty: "Карточки не найдены в output/todotest-tip-3.json.",
    question: "Вопрос",
    test: "Тест",
    correctAnswer: "Правильный ответ",
    yourAnswer: "Твой ответ",
    noExplanation: "Пояснение отсутствует.",
    back: "Назад",
    check: "Проверить",
    retry: "Заново",
    random: "Случайная",
    next: "Вперед",
    loading: "Перевод...",
  },
};

function getOptionClass(state) {
  if (state === "correct") return `${styles.optionBtn} ${styles.optionCorrect}`;
  if (state === "wrong") return `${styles.optionBtn} ${styles.optionWrong}`;
  if (state === "selected") return `${styles.optionBtn} ${styles.optionSelected}`;
  return styles.optionBtn;
}

export default function FlashcardsClient({ cards }) {
  const [index, setIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [checked, setChecked] = useState(false);
  const [language, setLanguage] = useState("es");
  const [translations, setTranslations] = useState({});
  const [isTranslating, setIsTranslating] = useState(false);

  const total = cards.length;
  const card = cards[index];
  const t = UI_TEXT[language];
  const translatedCard = card ? translations[card.id] : null;

  const currentCard = useMemo(() => {
    if (!card) return null;
    if (language === "ru" && translatedCard) {
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
  }, [card, language, translatedCard]);

  useEffect(() => {
    if (!card || language !== "ru" || translations[card.id]) return;

    let active = true;

    async function translateCurrentCard() {
      setIsTranslating(true);
      try {
        const payload = {
          target: "ru",
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

        if (!response.ok) throw new Error("Translation failed");
        const data = await response.json();
        const translatedTexts = Array.isArray(data.texts) ? data.texts : [];
        const [testTitle, questionText, ...tail] = translatedTexts;
        const explanation = tail[tail.length - 1] || "";
        const optionTexts = tail.slice(0, Math.max(0, tail.length - 1));

        if (!active) return;
        setTranslations((prev) => ({
          ...prev,
          [card.id]: {
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
          [card.id]: {
            testTitle: card.testTitle,
            questionText: card.questionText,
            optionTexts: card.options.map((option) => option.text),
            explanation: card.explanation || "",
          },
        }));
      } finally {
        if (active) setIsTranslating(false);
      }
    }

    translateCurrentCard();
    return () => {
      active = false;
    };
  }, [card, language, translations]);

  function goPrev() {
    setIndex((current) => Math.max(0, current - 1));
    setSelectedOption(null);
    setChecked(false);
  }

  function goNext() {
    setIndex((current) => Math.min(total - 1, current + 1));
    setSelectedOption(null);
    setChecked(false);
  }

  function goRandom() {
    if (!total) return;
    setIndex(Math.floor(Math.random() * total));
    setSelectedOption(null);
    setChecked(false);
  }

  function checkAnswer() {
    if (!selectedOption || (language === "ru" && !translatedCard)) return;
    setChecked(true);
  }

  function resetCurrentCard() {
    setSelectedOption(null);
    setChecked(false);
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

  const optionDisabled = checked || (language === "ru" && !translatedCard);
  const shownCard = currentCard || card;
  const questionImages = Array.isArray(card.questionImages) ? card.questionImages : [];

  return (
    <main className={styles.shell}>
      <Card className={styles.frame}>
        <div className="flex flex-col gap-3">
          <div className={`flex items-start justify-between gap-3 ${styles.topRow}`}>
            <div>
              <p className={styles.kicker}>Sistema de entrenamiento</p>
              <h2 className={styles.testTitle}>{shownCard.testTitle}</h2>
            </div>

            <div className={`flex items-center gap-2 ${styles.controls}`}>
              <Button
                size="sm"
                variant={language === "ru" ? "default" : "outline"}
                className={`${styles.langButton} ${language === "ru" ? styles.langButtonActive : ""}`}
                onClick={() => setLanguage((value) => (value === "es" ? "ru" : "es"))}
              >
                RU
              </Button>

              <div className={styles.progressWrap}>
                <p className={styles.progressText}>
                  {String(index + 1).padStart(3, "0")} / {String(total).padStart(3, "0")}
                </p>
              </div>
            </div>
          </div>

          <div className={`flex flex-wrap gap-2 ${styles.metaRow}`}>
            <Badge className={styles.metaBadge}>
              {t.question} {card.questionNumber}
            </Badge>
            <Badge className={styles.metaBadge}>
              {t.test} {card.testNumber}
            </Badge>
          </div>

          <h3 className={styles.questionTitle}>
            {language === "ru" && !translatedCard ? t.loading : shownCard.questionText}
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
                {language === "ru" && !translatedCard ? t.loading : shownCard.explanation || t.noExplanation}
              </p>
            </div>
          ) : null}
        </div>

        <div className={styles.dock}>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                className={styles.actionPrimary}
                onClick={checked ? resetCurrentCard : checkAnswer}
                disabled={!checked && (!selectedOption || (language === "ru" && !translatedCard))}
              >
                {checked ? t.retry : t.check}
              </Button>
              <Button className={styles.actionAccent} onClick={goRandom}>
                {t.random}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button className={styles.navBack} onClick={goPrev} disabled={index === 0}>
                {t.back}
              </Button>
              <Button className={styles.navNext} onClick={goNext} disabled={index === total - 1}>
                {t.next}
              </Button>
            </div>
          </div>

          {language === "ru" && isTranslating ? (
            <p className={`mt-2 text-center text-xs ${styles.translationHint}`}>{t.loading}</p>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
