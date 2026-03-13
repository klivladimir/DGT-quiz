"use client";

import { useEffect, useMemo, useState } from "react";

const UI_TEXT = {
  es: {
    empty: "No se encontraron tarjetas en output/todotest-tip-3.",
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
    empty: "Карточки не найдены в output/todotest-tip-3.",
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

  const progress = useMemo(() => { 
    if (!total) return "0 / 0";
    return `${index + 1} / ${total}`;
  }, [index, total]);

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
    const randomIndex = Math.floor(Math.random() * total);
    setIndex(randomIndex);
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
    if (!checked) {
      return optionKey === selectedOption ? "selected" : "idle";
    }

    if (optionKey === card.correctAnswer) return "correct";
    if (optionKey === selectedOption && selectedOption !== card.correctAnswer) return "wrong";
    return "idle";
  }

  function optionClass(optionKey) {
    const state = optionState(optionKey);

    if (state === "correct") {
      return "border-emerald-500/70 bg-emerald-100/80 text-emerald-900 dark:border-emerald-400/70 dark:bg-emerald-500/20 dark:text-emerald-50";
    }

    if (state === "wrong") {
      return "border-rose-500/70 bg-rose-100/80 text-rose-900 dark:border-rose-400/70 dark:bg-rose-500/20 dark:text-rose-50";
    }

    if (state === "selected") {
      return "border-sky-500/70 bg-sky-100/80 text-sky-900 dark:border-sky-400/70 dark:bg-sky-500/20 dark:text-sky-50";
    }

    return "border-slate-200 bg-white text-slate-800 hover:border-indigo-400/60 hover:bg-indigo-50/60 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:border-indigo-300/50 dark:hover:bg-indigo-500/10";
  }

  const navButtonClass =
    "min-h-12 rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45 md:min-h-11 md:px-4";

  if (!card) {
    return (
      <main className="flex min-h-dvh items-end bg-gradient-to-b from-slate-50 via-indigo-50/50 to-cyan-50/60 px-3 pb-[calc(env(safe-area-inset-bottom)+20dvh)] pt-[calc(env(safe-area-inset-top)+12px)] dark:from-slate-950 dark:via-indigo-950/30 dark:to-cyan-950/20 md:items-center md:pb-6">
        <section className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-soft backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/85">
          <h1 className="text-xl font-semibold tracking-tight">Flashcards</h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{t.empty}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-end bg-gradient-to-b from-slate-50 via-indigo-50/50 to-cyan-50/60 px-3 pb-[calc(env(safe-area-inset-bottom)+20dvh)] pt-[calc(env(safe-area-inset-top)+12px)] dark:from-slate-950 dark:via-indigo-950/30 dark:to-cyan-950/20 md:items-center md:pb-6">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-soft backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/85 md:p-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="max-w-[68%] text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50 md:max-w-none md:text-2xl">
            {currentCard?.testTitle || card.testTitle}
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`inline-flex min-h-9 min-w-11 items-center justify-center rounded-full border px-3 text-xs font-extrabold tracking-wide transition ${
                language === "ru"
                  ? "border-indigo-500 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-500"
                  : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
              }`}
              onClick={() => setLanguage((value) => (value === "es" ? "ru" : "es"))}
            >
              RU
            </button>
            <span className="rounded-full border border-slate-300 bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 md:text-sm">
              {progress}
            </span>
          </div>
        </header>

        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 md:text-sm">
          <span>
            {t.question} {card.questionNumber}
          </span>
          <span>
            {t.test} {card.testNumber}
          </span>
        </div>

        <h2 className="mt-4 text-[1.05rem] font-semibold leading-snug text-slate-900 dark:text-slate-50 md:mt-5 md:text-2xl">
          {language === "ru" && !translatedCard ? t.loading : currentCard?.questionText}
        </h2>

        <ul className="mt-4 grid list-none gap-2.5 p-0 md:mt-5 md:gap-3">
          {(currentCard?.options || card.options).map((option) => (
            <li key={option.key}>
              <button
                type="button"
                className={`w-full rounded-2xl border px-3 py-3 text-left text-[0.95rem] leading-relaxed shadow-sm transition min-h-12 md:px-4 md:py-3.5 md:text-base ${optionClass(
                  option.key
                )}`}
                onClick={() => {
                  if (!checked) setSelectedOption(option.key);
                }}
                disabled={checked || (language === "ru" && !translatedCard)}
              >
                <strong>{option.key})</strong> {option.text}
              </button>
            </li>
          ))}
        </ul>

        {checked ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm leading-relaxed text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-900/30 dark:text-emerald-50 md:mt-5 md:p-4 md:text-base">
            <p className="mb-2">
              <strong>{t.correctAnswer}:</strong> {card.correctAnswer}
            </p>
            <p className="mb-2">
              <strong>{t.yourAnswer}:</strong> {selectedOption}
            </p>
            <p>
              {language === "ru" && !translatedCard
                ? t.loading
                : currentCard?.explanation || t.noExplanation}
            </p>
          </div>
        ) : null}

        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+10px)] mt-4 rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-xl backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/95 md:static md:mt-6 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
          <footer className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                className={`${navButtonClass} bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500`}
                onClick={checked ? resetCurrentCard : checkAnswer}
                disabled={!checked && (!selectedOption || (language === "ru" && !translatedCard))}
              >
                {checked ? t.retry : t.check}
              </button>
              <button
                type="button"
                className={`${navButtonClass} bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500`}
                onClick={goRandom}
              >
                {t.random}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                className={`${navButtonClass} bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600`}
                onClick={goPrev}
                disabled={index === 0}
              >
                {t.back}
              </button>
              <button
                type="button"
                className={`${navButtonClass} bg-sky-600 hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-500`}
                onClick={goNext}
                disabled={index === total - 1}
              >
                {t.next}
              </button>
            </div>
          </footer>
          {language === "ru" && isTranslating ? (
            <p className="mt-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 md:mt-3 md:text-sm">
              {t.loading}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
