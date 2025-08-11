// --- Der JavaScript-Code bleibt unverändert, da er keine externen Anfragen sendet. ---
// --- Hier wird der gesamte JavaScript-Block aus der Originaldatei eingefügt. ---

// Global variables
let masterVocabularyList = [];
let currentLearningYearVocabulary = [];
let newConjugationTables = null;
let vocabularyModeAvailable = false;
let conjugationQuestionList = [];

const personNumberMap = [
    { text: "1. Person Singular", type: "singular", index: 0 },
    { text: "2. Person Singular", type: "singular", index: 1 },
    { text: "3. Person Singular", type: "singular", index: 2 },
    { text: "1. Person Plural", type: "plural", index: 0 },
    { text: "2. Person Plural", type: "plural", index: 1 },
    { text: "3. Person Plural", type: "plural", index: 2 }
];

let currentProgressScore = 0;
let missedItems = [];

// DOM Elements
const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');
const submitButton = document.getElementById('submit-button');
const hintButton = document.getElementById('hint-button');
const solutionButton = document.getElementById('solution-button');
const modeButton = document.getElementById('mode-button');
const learningYearButton = document.getElementById('learning-year-button');
const downloadButton = document.getElementById('download-button');
const questionArea = document.getElementById('question-area');
const choiceArea = document.getElementById('choice-area');

// Game State
let currentWord = null;
let currentConjugationTask = null;
let hintsUsed = 0;
let previousTaskOutcome = null;
let gameState = 'initial';
let currentQuizType = '';
let currentFilterDisplay = "Alle Lernjahre, Alle Kapitel";

// --- DATA LOADING ---
async function loadGameData() {
    try {
        aiSpeak("Daten lade ich, junger Padawan...");

        const [vocabResult, conjResult] = await Promise.allSettled([
            fetch('latein_daten.json').catch(e => ({ status: 'error', reason: e })),
            // CORRECTED: Fetch the shortened JSON file
            fetch('latein_daten_gek.json').catch(e => ({ status: 'error', reason: e }))
        ]);

        if (vocabResult.status === 'fulfilled' && vocabResult.value.ok) {
            const vocabData = await vocabResult.value.json();
            masterVocabularyList = vocabData.vocabulary || [];
            vocabularyModeAvailable = masterVocabularyList.length > 0;
        } else {
            vocabularyModeAvailable = false;
            console.warn("Warnung: Vokabel-Datei 'latein_daten.json' konnte nicht geladen werden.");
        }

        if (conjResult.status === 'fulfilled' && conjResult.value.ok) {
            newConjugationTables = await conjResult.value.json();
            if (!newConjugationTables || !newConjugationTables.konjugations || newConjugationTables.konjugations.length === 0) {
                throw new Error("Konjugations-Datei ist leer oder hat ein ungültiges Format.");
            }
        } else {
             throw new Error(`Kritischer Fehler: Konjugations-Datei konnte nicht geladen werden.`);
        }

        buildConjugationQuestionList();

        aiSpeak("Daten geladen, die Macht stark in dir ist!");
        currentProgressScore = 0;
        updateProgressBar();
        requestInitialMode();

    } catch (error) {
        console.error('Fehler beim Laden der Spieldaten:', error);
        aiSpeak(`Einen schweren Fehler beim Laden der Daten es gab, hmmm. ${error.message}. Die Konsole prüfen du musst.`);
        questionArea.innerHTML = `<p class="text-rose-500">Fehler: ${error.message}</p>`;
        disableActionButtons(true);
    }
}

// --- GAME FLOW & MODE/FILTER SELECTION ---

function requestInitialMode() {
    gameState = 'awaitingInitialModeChoice';
    currentQuizType = '';
    questionArea.innerHTML = '';
    choiceArea.innerHTML = '';
    aiSpeak("Was möchtest du lernen, junger Padawan? Tippe <strong class='text-black'>Vokabeln</strong> oder <strong class='text-black'>Konjugation</strong>.");
    disableActionButtons(true);
    userInput.value = '';
    userInput.focus();
}

function handleInitialModeChoice(choice) {
    choice = choice.toLowerCase().trim();
    if (choice.includes('vokabel')) {
        if (!vocabularyModeAvailable) {
            aiSpeak("Leider sind keine Vokabeldaten geladen. Der Vokabelmodus ist nicht verfügbar. Möchtest du Konjugationen üben? Tippe 'Konjugation'.");
            return;
        }
        aiSpeak("Der Weg der Vokabeln, weise er ist. Zuerst die Filter setzen wir müssen.");
        currentQuizType = 'vocabulary';
        requestFilters();
    } else if (choice.includes('konjugation')) {
        if (conjugationQuestionList && conjugationQuestionList.length > 0) {
            aiSpeak("Die Formen der Verben, eine Prüfung sie sind. Bereit du sein musst!");
            currentQuizType = 'conjugation';
            gameState = 'conjugationQuiz';
            missedItems = [];
            updateMissedItemsList();
            updateProgressBar();
            askConjugationQuestion();
        } else {
            aiSpeak("Die Konjugationsdaten sind nicht bereit oder fehlerhaft. Wähle 'Vokabeln', falls verfügbar.");
        }
    } else {
        aiSpeak("Diesen Pfad ich nicht verstehe. 'Vokabeln' oder 'Konjugation' wählen du musst.");
        userInput.focus();
    }
}

function requestMode() {
    previousTaskOutcome = null;
    gameState = 'awaitingModeChoice';
    currentQuizType = '';
    questionArea.innerHTML = ''; choiceArea.innerHTML = '';
    aiSpeak("Einen anderen Pfad du wählen möchtest? <strong class='text-black'>Vokabeln</strong> oder <strong class='text-black'>Konjugation</strong> tippen du musst!");
    disableActionButtons(true);
    userInput.value = ''; userInput.focus();
}

function handleModeChoice(choice) {
     handleInitialModeChoice(choice);
}

function requestFilters() {
     if (!vocabularyModeAvailable) {
        aiSpeak("Der Vokabelmodus ist nicht verfügbar, da keine Vokabeldaten geladen wurden.");
        requestMode();
        return;
    }
    previousTaskOutcome = null;
    gameState = 'awaitingFilterChoice';
    questionArea.innerHTML = ''; choiceArea.innerHTML = '';
    aiSpeak("Filtere deine Vokabeln, Padawan!<br>Gib Lernjahre ein (z.B. '1', '1,2', '1-3', 'alle').<br>Optional: Füge Kapitel hinzu (z.B. 'K5', 'K10-12', 'alle K').<br>Beispiele: '1 K5', '1,2 K10-12', 'alle K20', '2'.");
    disableActionButtons(true);
    userInput.value = ''; userInput.focus();
}

function handleFilterChoice(input) {
    input = input.trim().toLowerCase();
    let selectedYearsLocal = [];
    let chapterFilterLocal = null;
    const filterRegex = /^(alle|\d(?:[,-]\d?)*)\s*(?:(?:k|kapitel)\s*(\d+)(?:-(\d+))?)?$/i;
    const match = input.match(filterRegex);

    if (match) {
        const yearInput = match[1];
        const chapterSingleRaw = match[2];
        const chapterEndRaw = match[3];

        if (yearInput === "alle") {
            selectedYearsLocal = ["alle"];
        } else if (yearInput.includes('-')) {
            const parts = yearInput.split('-');
            if (parts.length === 2) {
                const start = parseInt(parts[0]); const end = parseInt(parts[1]);
                if (!isNaN(start) && !isNaN(end) && start <= end && start >= 1 && end <= 3) {
                    for (let i = start; i <= end; i++) selectedYearsLocal.push(i);
                }
            }
        } else {
            selectedYearsLocal = yearInput.split(/[,+]/)
                                   .map(y => parseInt(y.trim()))
                                   .filter(yNum => !isNaN(yNum) && yNum >= 1 && yNum <= 3);
        }

        if (selectedYearsLocal.length === 0 && yearInput !== "alle") {
             aiSpeak("Ungültige Lernjahr-Angabe. Versuche es erneut.");
             requestFilters(); return;
        }

        if (chapterSingleRaw) {
            const startChapter = parseInt(chapterSingleRaw);
            if (!isNaN(startChapter)) {
                if (chapterEndRaw) {
                    const endChapter = parseInt(chapterEndRaw);
                    if (!isNaN(endChapter) && startChapter <= endChapter) chapterFilterLocal = { start: startChapter, end: endChapter };
                    else { aiSpeak("Ungültiger Kapitelbereich."); requestFilters(); return; }
                } else chapterFilterLocal = { single: startChapter };
            }
        } else if (input.includes("alle k")) chapterFilterLocal = null;
        else if (match[2] === undefined && yearInput !== "alle" && selectedYearsLocal.length > 0 && !input.match(/(k|kapitel)/i) ) chapterFilterLocal = null;

        if (selectedYearsLocal.length > 0 || yearInput === "alle") {
            currentQuizType = 'vocabulary';
            applyFiltersAndStartGame(selectedYearsLocal, chapterFilterLocal);
        } else {
            aiSpeak("Keine gültigen Lernjahre angegeben. Versuche es erneut.");
            requestFilters();
        }
    } else {
        aiSpeak("Eingabe nicht verstanden. Beispiel: '1,2 K5' oder 'alle K10-12' oder '2'.");
        requestFilters();
    }
}

function applyFiltersAndStartGame(selectedYearsToFilterBy, chapterFilterToApply) {
    let tempFilteredVocabulary = [...masterVocabularyList];

    if (selectedYearsToFilterBy && selectedYearsToFilterBy.length > 0 && !selectedYearsToFilterBy.includes("alle")) {
        tempFilteredVocabulary = tempFilteredVocabulary.filter(vocab => {
            const vocabLearningYear = parseInt(vocab.learning_year);
            return !isNaN(vocabLearningYear) && selectedYearsToFilterBy.includes(vocabLearningYear);
        });
    }

    if (chapterFilterToApply) {
        if (chapterFilterToApply.single) {
            tempFilteredVocabulary = tempFilteredVocabulary.filter(vocab => {
                return typeof vocab.chapter !== 'undefined' && vocab.chapter !== null && parseInt(vocab.chapter) === chapterFilterToApply.single;
            });
        } else if (chapterFilterToApply.start && chapterFilterToApply.end) {
            tempFilteredVocabulary = tempFilteredVocabulary.filter(vocab => {
                return typeof vocab.chapter !== 'undefined' && vocab.chapter !== null &&
                       parseInt(vocab.chapter) >= chapterFilterToApply.start &&
                       parseInt(vocab.chapter) <= chapterFilterToApply.end;
            });
        }
    }

    let lyDisplay = "Alle";
    if (selectedYearsToFilterBy && selectedYearsToFilterBy.length > 0 && !selectedYearsToFilterBy.includes("alle")) {
        lyDisplay = selectedYearsToFilterBy.join('+');
    }
    let chDisplay = "Alle Kapitel";
    if (chapterFilterToApply) {
        if (chapterFilterToApply.single) chDisplay = `Kapitel ${chapterFilterToApply.single}`;
        else if (chapterFilterToApply.start && chapterFilterToApply.end) chDisplay = `Kapitel ${chapterFilterToApply.start}-${chapterFilterToApply.end}`;
    }
    currentFilterDisplay = `Lernjahr(e): ${lyDisplay}, ${chDisplay}`;

    if (tempFilteredVocabulary.length > 0) {
        currentLearningYearVocabulary = tempFilteredVocabulary;
        aiSpeak(`Filter angewendet. Du übst nun Vokabeln für: ${currentFilterDisplay}.`);
        currentProgressScore = 0;
        missedItems = [];
        previousTaskOutcome = null;
        updateMissedItemsList();
        updateProgressBar();
        initializeGameForCurrentFilters();
    } else {
        aiSpeak(`Keine Vokabeln für die Filter: ${currentFilterDisplay}. Andere Auswahl treffen du musst.`);
        requestFilters();
    }
}

function initializeGameForCurrentFilters() {
    updateMissedItemsList();
    updateProgressBar();
    gameState = 'vocabularyQuiz';
    questionArea.innerHTML = '';
    choiceArea.innerHTML = '';
    if (currentLearningYearVocabulary.length > 0) {
        askVocabularyQuestion();
    } else {
        aiSpeak("Ein unerwarteter Fehler: Keine Vokabeln trotz Filterung. Bitte Modus oder Filter ändern.");
        requestMode();
    }
}

// --- CONJUGATION QUIZ LOGIC (REWRITTEN FOR ROBUSTNESS) ---

function buildConjugationQuestionList() {
    conjugationQuestionList = [];
    if (!newConjugationTables || !newConjugationTables.konjugations) {
        return;
    }

    const infinitiveMap = new Map();
    const praesensAktivGruppe = newConjugationTables.konjugations.find(g => g.title === "Indikativ Präsens Aktiv");
    if (praesensAktivGruppe && praesensAktivGruppe.classes) {
        praesensAktivGruppe.classes.forEach(c => {
            if (c.name && c.infinitive) infinitiveMap.set(c.name, c.infinitive);
        });
    }

    for (const group of newConjugationTables.konjugations) {
        if (group.type === "Nominalform") continue;

        if (group.classes && Array.isArray(group.classes)) {
            for (const verbClass of group.classes) {
                if (!verbClass || !verbClass.forms || !verbClass.german) continue;
                const baseInfinitive = infinitiveMap.get(verbClass.name) || verbClass.infinitive || 'Unbekannt';
                for (const personEntry of personNumberMap) {
                    const latinFormsArray = verbClass.forms[personEntry.type];
                    const germanFormsArray = verbClass.german[personEntry.type];
                    if (Array.isArray(latinFormsArray) && Array.isArray(germanFormsArray) && latinFormsArray.length > personEntry.index && germanFormsArray.length > personEntry.index) {
                        const latinForm = latinFormsArray[personEntry.index];
                        const germanForm = germanFormsArray[personEntry.index];
                        if (latinForm && germanForm) {
                            conjugationQuestionList.push({
                                latinFormToAsk: latinForm.split(',')[0].trim().replace(/[!]/g, ""),
                                correctGermanAnswer: germanForm,
                                description: `${group.title}, ${personEntry.text} von ${baseInfinitive}`
                            });
                        }
                    }
                }
            }
        }
        else if (group.verb && group.tables && Array.isArray(group.tables)) {
            const baseInfinitive = group.verb;
            for (const table of group.tables) {
                if (!table || !table.tenses_moods || !Array.isArray(table.tenses_moods)) continue;
                for (const tenseMood of table.tenses_moods) {
                    for (const mood of ['Indikativ', 'Konjunktiv']) {
                        if (tenseMood && tenseMood[mood] && tenseMood.german && tenseMood.german[mood]) {
                            for (const personEntry of personNumberMap) {
                                const latinFormsArray = tenseMood[mood][personEntry.type];
                                const germanFormsArray = tenseMood.german[mood][personEntry.type];
                                if (Array.isArray(latinFormsArray) && Array.isArray(germanFormsArray) && latinFormsArray.length > personEntry.index && germanFormsArray.length > personEntry.index) {
                                    const latinForm = latinFormsArray[personEntry.index];
                                    const germanForm = germanFormsArray[personEntry.index];
                                    if (latinForm && germanForm) {
                                        conjugationQuestionList.push({
                                            latinFormToAsk: latinForm.split(',')[0].trim().replace(/[!]/g, ""),
                                            correctGermanAnswer: germanForm,
                                            description: `${baseInfinitive} - ${tenseMood.tense} ${mood}, ${personEntry.text}`
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    console.log(`Konjugations-Fragenliste erstellt. Anzahl der Fragen: ${conjugationQuestionList.length}`);
    if(conjugationQuestionList.length === 0 && newConjugationTables.konjugations.length > 0) {
         console.error("FEHLER: Die Konjugations-Fragenliste ist nach der Erstellung leer!");
    }
}


function askConjugationQuestion() {
    if (!conjugationQuestionList || conjugationQuestionList.length === 0) {
        aiSpeak("Keine Konjugationsfragen gefunden. Der Modus kann nicht gestartet werden.");
        requestMode();
        return;
    }

     if (previousTaskOutcome && previousTaskOutcome.type === 'conjugation') {
        addMissedItemToList(previousTaskOutcome.data, 'conjugation', previousTaskOutcome.answeredWithHint);
    }
    previousTaskOutcome = null;
    gameState = 'conjugationQuiz';
    currentQuizType = 'conjugation';

    const taskData = conjugationQuestionList[Math.floor(Math.random() * conjugationQuestionList.length)];
    currentConjugationTask = { ...taskData };

    hintsUsed = 0;
    const questionText = `Was bedeutet die Form <strong class="text-sky-500">${currentConjugationTask.latinFormToAsk}</strong> auf Deutsch?`;
    questionArea.innerHTML = questionText;
    userInput.value = '';
    userInput.focus();
    enableActionButtons();
    choiceArea.innerHTML = '';
    updateProgressBar();
}

function checkConjugationAnswer(userAnswer) {
    if (!currentConjugationTask || userAnswer === null || typeof userAnswer === 'undefined') return;

    const normalizedUserAnswer = normalizeTextForComparison(userAnswer);
    const correctAnswers = currentConjugationTask.correctGermanAnswer.split('/').map(s => normalizeTextForComparison(s));

    const isCorrect = correctAnswers.some(answer => normalizedUserAnswer === answer);

    if (isCorrect) {
        if (hintsUsed === 0) {
            currentProgressScore = Math.min(100, currentProgressScore + 2);
            missedItems = missedItems.filter(item => !(item.type === 'conjugation' && item.data.latinFormToAsk === currentConjugationTask.latinFormToAsk));
            updateMissedItemsList();
            previousTaskOutcome = null;
        } else {
            currentProgressScore = Math.min(100, currentProgressScore + 1);
            previousTaskOutcome = { type: 'conjugation', data: { ...currentConjugationTask }, answeredWithHint: true };
            addMissedItemToList(currentConjugationTask, 'conjugation', true);
        }
        updateProgressBar();
        aiSpeak(`Exzellent! 🏆 <strong class="text-black">${currentConjugationTask.correctGermanAnswer}</strong> ist die richtige Übersetzung für <strong class="text-black">${currentConjugationTask.latinFormToAsk}</strong>.`);
        questionArea.innerHTML = ""; choiceArea.innerHTML = ''; disableActionButtons();
        setTimeout(askConjugationQuestion, 2500);
    } else {
         previousTaskOutcome = { type: 'conjugation', data: { ...currentConjugationTask }, answeredWithHint: false };
         addMissedItemToList(currentConjugationTask, 'conjugation', false);
         aiSpeak(`Fast! <strong class="text-black">'${userAnswer}'</strong> war nicht ganz richtig. Korrekt für <strong class="text-black">${currentConjugationTask.latinFormToAsk}</strong> ist <strong class="text-black">${currentConjugationTask.correctGermanAnswer}</strong>.`);
         questionArea.innerHTML = ""; choiceArea.innerHTML = ''; disableActionButtons();
         setTimeout(askConjugationQuestion, 3000);
    }
    userInput.value = ''; userInput.focus();
}

function giveConjugationHint() {
    if (!currentConjugationTask || hintsUsed >= 1 || gameState !== 'conjugationQuiz') {
        if(hintsUsed >= 1) aiSpeak("Hinweis bereits genutzt, junger Padawan.");
        return;
    }
    hintsUsed++;
    aiSpeak(`Ein Tipp, du brauchst? Die Form <strong class="text-black">${currentConjugationTask.latinFormToAsk}</strong> ist: <strong class="text-black">${currentConjugationTask.description}</strong>.`);
    if (hintButton) {
        hintButton.disabled = true;
        hintButton.classList.add('disabled-button');
    }
}

function showConjugationSolution() {
    if (!currentConjugationTask || gameState !== 'conjugationQuiz') return;
    aiSpeak(`Lösung für <strong class="text-black">${currentConjugationTask.latinFormToAsk}</strong>: <strong class="font-semibold text-black">${currentConjugationTask.correctGermanAnswer}</strong>. (${currentConjugationTask.description})`);
    addMissedItemToList(currentConjugationTask, 'conjugation', false);
    updateProgressBar();
    questionArea.innerHTML = ""; choiceArea.innerHTML = ''; disableActionButtons();
    setTimeout(askConjugationQuestion, 3000);
}

// --- VOCABULARY QUIZ LOGIC ---

function askVocabularyQuestion() {
    if (!vocabularyModeAvailable || currentLearningYearVocabulary.length === 0) {
        aiSpeak("Keine Vokabeln für Auswahl. Filter/Modus ändern.");
        disableActionButtons(); requestMode(); return;
    }
    if (previousTaskOutcome && previousTaskOutcome.type === 'vocabulary') {
         addMissedItemToList(previousTaskOutcome.data, 'vocabulary', previousTaskOutcome.answeredWithHint);
    }
    previousTaskOutcome = null;
    gameState = 'vocabularyQuiz'; currentQuizType = 'vocabulary';
    currentWord = currentLearningYearVocabulary[Math.floor(Math.random() * currentLearningYearVocabulary.length)];
    hintsUsed = 0;
    questionArea.innerHTML = `Was heißt <strong class="text-sky-500">${currentWord.latin}</strong> auf Deutsch? (${currentFilterDisplay})`;
    userInput.value = ''; userInput.focus(); enableActionButtons(); choiceArea.innerHTML = '';
    updateProgressBar();
}

function checkVocabularyAnswer(userAnswer) {
    if (!currentWord || userAnswer === null || typeof userAnswer === 'undefined') return;
    const correctNormalizedIndividualAnswers = currentWord.german.flatMap(g => g.split(/[,;]/).map(part => normalizeTextForComparison(part.trim())).filter(part => part.length > 0));
    const potentialAnswerParts = userAnswer.split(/[,;]/).map(part => normalizeTextForComparison(part.trim())).filter(part => part.length > 0);
    let isCorrect = false; let matchedNormalizedAnswer = null;

    for (const part of potentialAnswerParts) {
        if (correctNormalizedIndividualAnswers.includes(part)) { isCorrect = true; matchedNormalizedAnswer = part; break; }
    }
    if (!isCorrect) {
        const fullyNormalizedUserAnswer = normalizeTextForComparison(userAnswer);
        if (correctNormalizedIndividualAnswers.includes(fullyNormalizedUserAnswer)) { isCorrect = true; matchedNormalizedAnswer = fullyNormalizedUserAnswer; }
    }
    let partialMatchButCorrect = false;
    if (isCorrect && correctNormalizedIndividualAnswers.length > 1 && potentialAnswerParts.length < correctNormalizedIndividualAnswers.length) {
         if (correctNormalizedIndividualAnswers.filter(cn => potentialAnswerParts.includes(cn)).length === potentialAnswerParts.length) partialMatchButCorrect = true;
         else isCorrect = false;
    }

    if (isCorrect) {
        if (hintsUsed === 0) {
            currentProgressScore = Math.min(100, currentProgressScore + 2);
            missedItems = missedItems.filter(item => !(item.type === 'vocabulary' && item.data.latin === currentWord.latin));
            updateMissedItemsList();
            previousTaskOutcome = null;
            if (partialMatchButCorrect) aiSpeak(`Sehr gut! <strong class="text-black">'${userAnswer}'</strong> ist eine korrekte Bedeutung von <strong class="text-black">'${currentWord.latin}'</strong>. Auch: <strong class="text-black">${correctNormalizedIndividualAnswers.filter(cn => cn !== matchedNormalizedAnswer).join(' / ') || 'keine weiteren'}</strong>.`);
            else aiSpeak(`Perfekt! <strong class="text-black">'${currentWord.latin}'</strong> ist <strong class="text-black">'${currentWord.german.join(' / ')}'</strong>.`);
        } else {
            currentProgressScore = Math.min(100, currentProgressScore + 1);
            previousTaskOutcome = { type: 'vocabulary', data: { ...currentWord }, answeredWithHint: true };
            addMissedItemToList(currentWord, 'vocabulary', true);
            aiSpeak(`Mit Tipp geklappt! <strong class="text-black">'${currentWord.latin}'</strong> ist <strong class="text-black">'${currentWord.german.join(' / ')}'</strong>.`);
        }
        updateProgressBar();
        questionArea.innerHTML = ""; choiceArea.innerHTML = ''; disableActionButtons();
        setTimeout(askVocabularyQuestion, 2500);
    } else {
        previousTaskOutcome = { type: 'vocabulary', data: { ...currentWord }, answeredWithHint: false };
        addMissedItemToList(currentWord, 'vocabulary', false);
        if (hintsUsed > 0) {
            aiSpeak(`Leider nicht richtig für <strong class="text-black">'${currentWord.latin}'</strong>. Korrekt: <strong class="text-black">${currentWord.german.join(' / ')}</strong>.`);
            questionArea.innerHTML = ""; choiceArea.innerHTML = ''; disableActionButtons();
            setTimeout(askVocabularyQuestion, 2500); return;
        } else {
            aiSpeak(`Nicht ganz richtig für <strong class="text-black">'${currentWord.latin}'</strong>. Deine Antwort: <strong class="text-black">'${userAnswer}'</strong>. 🤔`);
            if (hintsUsed < 1) aiSpeak("Tipp mit Auswahl? Klicke 💡 Hinweis!");
            else aiSpeak("Nochmal versuchen oder 🆘 Lösung prüfen.");
            enableActionButtons();
        }
    }
    userInput.value = ''; userInput.focus();
}

function giveVocabularyHint() {
    if (!currentWord || hintsUsed >= 1 || gameState !== 'vocabularyQuiz') {
        if (hintsUsed >= 1 && gameState === 'vocabularyQuiz') aiSpeak("Tipp bereits erhalten!");
        else if (gameState !== 'vocabularyQuiz' && currentQuizType === 'vocabulary') aiSpeak("Falscher Modus für Vokabel-Hinweis.");
        else aiSpeak("Kein Wort für Tipp ausgewählt.");
        if (hintsUsed >= 1 && hintButton) { hintButton.disabled = true; hintButton.classList.add('disabled-button');}
        return;
    }
    hintsUsed++;
    aiSpeak("Geduld du haben musst. Optionen ich dir zeige.");
    const correctAnswerForChoices = currentWord.german[0];
    let distractors = [];
    const tempVocab = [...currentLearningYearVocabulary];
    for (let i = tempVocab.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tempVocab[i], tempVocab[j]] = [tempVocab[j], tempVocab[i]]; }
    for (const voc of tempVocab) {
        if (distractors.length >= 3) break;
        const germanMeaning = voc.german[0];
        if (normalizeTextForComparison(germanMeaning) !== normalizeTextForComparison(correctAnswerForChoices) && !distractors.includes(germanMeaning)) distractors.push(germanMeaning);
    }
    const fallbackDistractors = ["Apfel", "Haus", "Weg", "Licht", "Wasser", "Freund"];
    let fallbackIndex = 0;
    while(distractors.length < 3) {
        const pD = fallbackDistractors[fallbackIndex % fallbackDistractors.length];
         if (normalizeTextForComparison(pD) !== normalizeTextForComparison(correctAnswerForChoices) && !distractors.includes(pD)) distractors.push(pD);
        fallbackIndex++;
         if (fallbackIndex > fallbackDistractors.length * 3 && distractors.length < 3) distractors.push(`Zufallsoption ${distractors.length + 1}`);
    }
    const choices = [correctAnswerForChoices, ...distractors];
    for (let i = choices.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [choices[i], choices[j]] = [choices[j], choices[i]];}
    choiceArea.innerHTML = '';
    questionArea.innerHTML = `Was heißt <strong class="text-yellow-400">${currentWord.latin}</strong>? Wähle aus:`;
    choices.forEach(choice => {
        const button = document.createElement('button');
        button.className = 'button-style bg-sky-500 m-1 text-sm';
        button.textContent = choice;
        button.addEventListener('click', () => { userSpeak(`Meine Wahl: ${choice}`); checkVocabularyAnswer(choice); choiceArea.innerHTML = ''; });
        choiceArea.appendChild(button);
    });
    if(hintButton) {hintButton.disabled = true; hintButton.classList.add('disabled-button');}
}

function showVocabularySolution() {
    if (!currentWord) return;
    aiSpeak(`Lösung für <strong class="text-black">${currentWord.latin}</strong>: <strong class="font-semibold text-black">${currentWord.german.join(' / ')}</strong>.`);
    addMissedItemToList(currentWord, 'vocabulary', false);
    updateProgressBar();
    questionArea.innerHTML = ""; choiceArea.innerHTML = ''; disableActionButtons();
    setTimeout(askVocabularyQuestion, 2500);
}

// --- UTILITY & UI FUNCTIONS ---

function addMissedItemToList(itemData, type, answeredWithHint) {
    missedItems = missedItems.filter(entry => {
        if (entry.type !== type) return true;
        if (type === 'vocabulary') return entry.data.latin !== itemData.latin;
        if (type === 'conjugation') return entry.data.latinFormToAsk !== itemData.latinFormToAsk;
        return true;
    });
    missedItems.push({ type: type, data: { ...itemData }, answeredWithHint: answeredWithHint });
    updateMissedItemsList();
}

function updateMissedItemsList() {
    missedItems.sort((a, b) => {
        if (a.answeredWithHint === false && b.answeredWithHint === true) return -1;
        if (a.answeredWithHint === true && b.answeredWithHint === false) return 1;
        return 0;
    });
    const listElement = document.getElementById('missed-items-list');
    const noMissedElement = document.getElementById('no-missed-items');
    listElement.innerHTML = '';
    if (missedItems.length === 0) {
        listElement.style.display = 'none';
        noMissedElement.style.display = 'block';
    } else {
        listElement.style.display = 'block';
        noMissedElement.style.display = 'none';
        missedItems.forEach(item => {
            const listItem = document.createElement('li');
            if (item.type === 'vocabulary') {
                listItem.textContent = `Vokabel: ${item.data.latin} – ${item.data.german.join(' / ')}`;
            } else if (item.type === 'conjugation') {
                 listItem.textContent = `Latein: ${item.data.latinFormToAsk} – Korrekt: ${item.data.correctGermanAnswer} (${item.data.description})`;
            }
            listItem.classList.remove('text-rose-500', 'text-amber-600');
            if (item.answeredWithHint === true) listItem.classList.add('text-amber-600');
            else listItem.classList.add('text-rose-500');
            listElement.appendChild(listItem);
        });
    }
}

function updateProgressBar() {
    const displayProgressPercentage = Math.min(100, Math.max(0, currentProgressScore));
    const progressBarElement = document.getElementById('progress-bar');
    const progressTextElement = document.getElementById('progress-text');
    const currentRankElement = document.getElementById('current-rank-title');

    if (progressBarElement && progressTextElement && currentRankElement) {
        progressBarElement.style.width = `${displayProgressPercentage.toFixed(0)}%`;
        progressTextElement.textContent = `${displayProgressPercentage.toFixed(0)}%`;
        let rank = "Jüngling";
        if (displayProgressPercentage >= 100) rank = "Meister d. A. Sprache";
        else if (displayProgressPercentage >= 80) rank = "Hüter der Syntax";
        else if (displayProgressPercentage >= 60) rank = "Jedi-Ritter";
        else if (displayProgressPercentage >= 40) rank = "Jedi-Gelehrter";
        else if (displayProgressPercentage >= 20) rank = "Padawan";
        currentRankElement.textContent = `Aktueller Rang: ${rank}`;
    }
}

function disableActionButtons(disableModeAndFilterToo = false) {
    if (hintButton) { hintButton.disabled = true; hintButton.classList.add('disabled-button'); }
    if (solutionButton) { solutionButton.disabled = true; solutionButton.classList.add('disabled-button'); }
    if (downloadButton) { downloadButton.disabled = true; downloadButton.classList.add('disabled-button');}
    if (disableModeAndFilterToo) {
        if (modeButton) { modeButton.disabled = true; modeButton.classList.add('disabled-button');}
        if (learningYearButton) { learningYearButton.disabled = true; learningYearButton.classList.add('disabled-button');}
    }
}

function enableActionButtons() {
    if (hintButton) { hintButton.disabled = false; hintButton.classList.remove('disabled-button'); }
    if (solutionButton) { solutionButton.disabled = false; solutionButton.classList.remove('disabled-button'); }
    if (modeButton) { modeButton.disabled = false; modeButton.classList.remove('disabled-button');}
    if (downloadButton) { downloadButton.disabled = false; downloadButton.classList.remove('disabled-button');}
    if (learningYearButton) {
        if (currentQuizType === 'vocabulary' || gameState === 'awaitingFilterChoice' || gameState === 'awaitingInitialModeChoice' || gameState === 'awaitingModeChoice') {
            learningYearButton.disabled = !vocabularyModeAvailable;
            if(vocabularyModeAvailable) learningYearButton.classList.remove('disabled-button');
            else learningYearButton.classList.add('disabled-button');
        } else {
            learningYearButton.disabled = true; learningYearButton.classList.add('disabled-button');
        }
    }
    if (hintsUsed >= 1 && (gameState === 'vocabularyQuiz' || gameState === 'conjugationQuiz') && hintButton) {
         hintButton.disabled = true; hintButton.classList.add('disabled-button');
    }
}

function aiSpeak(message) {
    const bubble = document.createElement('div');
    bubble.classList.add('chat-bubble', 'ai-bubble');
    bubble.innerHTML = message; chatArea.appendChild(bubble); scrollToBottom();
}
function userSpeak(message) {
    const bubble = document.createElement('div');
    bubble.classList.add('chat-bubble', 'user-bubble');
    bubble.textContent = message; chatArea.appendChild(bubble); scrollToBottom();
}
function scrollToBottom() { chatArea.scrollTop = chatArea.scrollHeight; }

function normalizeTextForComparison(text) {
    if (typeof text !== 'string' || !text) return '';
    let normalized = text.toLowerCase().trim();
    normalized = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    normalized = normalized.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
    normalized = normalized.replace(/\s+/g, ' ').trim();
    return normalized;
}

function decodeHtmlEntities(text) { const ta = document.createElement('textarea'); ta.innerHTML = text; return ta.value; }

function downloadMissedItemsAsTXT() {
    if (missedItems.length === 0) { aiSpeak("Keine verpassten Aufgaben zum Herunterladen!"); return; }
    let content = "Verpasste Aufgaben:\n\n";
    missedItems.forEach(item => {
        const itemText = item.type === 'vocabulary'
            ? `Vokabel: ${decodeHtmlEntities(item.data.latin)} – ${decodeHtmlEntities(item.data.german.join(' / '))}`
            : `Konjugation: ${decodeHtmlEntities(item.data.latinFormToAsk)} – Korrekt: ${decodeHtmlEntities(item.data.correctGermanAnswer)} (${decodeHtmlEntities(item.data.description)})`;
        content += itemText + '\n';
    });
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'verpasste_aufgaben.txt';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    aiSpeak("Liste der verpassten Aufgaben heruntergeladen.");
}

// --- EVENT LISTENERS ---
submitButton.addEventListener('click', () => {
    const text = userInput.value.trim();
    if (text) {
        userSpeak(text);
        if (gameState === 'awaitingInitialModeChoice' || gameState === 'awaitingModeChoice') handleModeChoice(text);
        else if (gameState === 'awaitingFilterChoice') handleFilterChoice(text);
        else if (currentQuizType === 'vocabulary') checkVocabularyAnswer(text);
        else if (currentQuizType === 'conjugation') checkConjugationAnswer(text);
        userInput.value = '';
    }
});

userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitButton.click(); });

hintButton.addEventListener('click', () => {
    if (currentQuizType === 'vocabulary') giveVocabularyHint();
    else if (currentQuizType === 'conjugation') giveConjugationHint();
});

solutionButton.addEventListener('click', () => {
    choiceArea.innerHTML = '';
    if (currentQuizType === 'vocabulary') showVocabularySolution();
    else if (currentQuizType === 'conjugation') showConjugationSolution();
});

if (modeButton) modeButton.addEventListener('click', () => { aiSpeak("Moduswechsel du wünschst?"); requestMode(); });

if (learningYearButton) {
    learningYearButton.addEventListener('click', () => {
        if (currentQuizType === 'vocabulary' || gameState === 'awaitingInitialModeChoice' || gameState === 'awaitingModeChoice') {
             if (!vocabularyModeAvailable) {
                aiSpeak("Der Vokabelmodus ist nicht verfügbar, da keine Vokabeldaten geladen wurden.");
                return;
            }
            aiSpeak("Vokabel-Filter du ändern möchtest?");
            currentQuizType = 'vocabulary'; requestFilters();
        } else aiSpeak("Filter nur für Vokabelmodus verfügbar.");
    });
}

if (downloadButton) downloadButton.addEventListener('click', downloadMissedItemsAsTXT);

// --- START GAME ---
loadGameData();
